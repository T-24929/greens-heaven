import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  Smartphone,
  Video,
  Check,
  Zap,
  ZapOff,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react'
import { BottomSheet } from '../motion/bottom-sheet.jsx'

// Optimize 2D canvas readback operations for QR frame decoding
// This silences the Chrome Canvas2D willReadFrequently warning and boosts decode speeds
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype._qrScanPatched) {
  const origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === '2d') {
      attributes = attributes ? { ...attributes, willReadFrequently: true } : { willReadFrequently: true }
    }
    return origGetContext.call(this, type, attributes)
  }
  HTMLCanvasElement.prototype._qrScanPatched = true
}

// Gentle pleasant chime when ticket QR is successfully scanned
function playScanSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08) // E6
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {
    // AudioContext blocked or unavailable
  }
}

// Tactile feedback on mobile devices
function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([35, 20, 35])
    }
  } catch {
    // Haptics unavailable
  }
}

// Thoroughly wipe and reset the video DOM element so the previous frame is never retained in GPU memory
function purgeVideoBuffer(videoEl) {
  if (!videoEl) return
  try {
    videoEl.pause()
    if (videoEl.srcObject) {
      const stream = videoEl.srcObject
      if (typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((track) => track.stop())
      }
      videoEl.srcObject = null
    }
    videoEl.removeAttribute('src')
    // Calling load() completely clears the video decoder surface, removing the frozen last frame
    videoEl.load()
  } catch {
    // Ignore video reset errors
  }
}

export default function TicketScanner({ onScan }) {
  const video = useRef(null)
  const scannerRef = useRef(null)
  const canScanRef = useRef(false)
  const sessionStartRef = useRef(0)
  const lastScannedRef = useRef({ code: null, time: 0 })

  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(() => {
    try {
      return localStorage.getItem('gh_admin_camera') || 'environment'
    } catch {
      return 'environment'
    }
  })
  const [fitMode, setFitMode] = useState(() => {
    try {
      return localStorage.getItem('gh_admin_camera_fit') || 'cover'
    } catch {
      return 'cover'
    }
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [hasFlash, setHasFlash] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)

  const toggleFitMode = () => {
    setFitMode((prev) => {
      const next = prev === 'cover' ? 'contain' : 'cover'
      try {
        localStorage.setItem('gh_admin_camera_fit', next)
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const callback = useRef(onScan)
  useEffect(() => {
    callback.current = onScan
  }, [onScan])

  const loadCameras = useCallback(async (scannerInstance) => {
    try {
      const { default: QrScanner } = await import('qr-scanner')
      const list = await QrScanner.listCameras(true)
      if (Array.isArray(list) && list.length > 0) {
        setCameras(list)
      }
      if (scannerInstance) {
        const flashAvailable = await scannerInstance.hasFlash().catch(() => false)
        setHasFlash(flashAvailable)
      }
    } catch {
      // Fallback if listCameras fails before permission
    }
  }, [])

  const [prevActive, setPrevActive] = useState(active)
  if (active !== prevActive) {
    setPrevActive(active)
    if (active) {
      setScanSuccess(false)
    }
  }

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let scanner = null
    const videoEl = video.current

    // Reset gating flags for new session
    canScanRef.current = false
    sessionStartRef.current = Date.now()

    import('qr-scanner')
      .then(async ({ default: QrScanner }) => {
        if (cancelled || !videoEl) return

        scanner = new QrScanner(
          videoEl,
          (result) => {
            // Guard 1: Drop frames until the camera stream is fully active and delivering fresh frames
            if (!canScanRef.current) return

            // Guard 2: Prevent old image from immediately re-checking the same ticket within 1.5s of camera start
            if (
              lastScannedRef.current.code &&
              result.data === lastScannedRef.current.code &&
              Date.now() - sessionStartRef.current < 1500
            ) {
              return
            }

            // Valid, fresh QR code detected!
            canScanRef.current = false
            lastScannedRef.current = { code: result.data, time: Date.now() }
            setScanSuccess(true)
            playScanSound()
            triggerHaptic()

            // Stop scanner and purge video buffer
            try {
              scanner.stop()
            } catch {
              // ignore scanner stop error
            }
            purgeVideoBuffer(videoEl)

            setTimeout(() => {
              setActive(false)
              callback.current(result.data)
            }, 120)
          },
          {
            preferredCamera: selectedCamera,
            maxScansPerSecond: 25, // High frame rate for instant, snappy scanning
            returnDetailedScanResult: true,
            highlightScanRegion: false,
            highlightCodeOutline: false, // Prevents SVG overlay lag
            // Generous scan region covering 90% of the viewport so users don't have to aim precisely at center
            calculateScanRegion: (v) => {
              const w = v.videoWidth || 1280
              const h = v.videoHeight || 720
              const size = Math.round(0.9 * Math.min(w, h))
              return {
                x: Math.round((w - size) / 2),
                y: Math.round((h - size) / 2),
                width: size,
                height: size,
                downScaledWidth: Math.min(size, 640),
                downScaledHeight: Math.min(size, 640),
              }
            },
          }
        )
        scannerRef.current = scanner

        // Scan both normal (dark on light) and inverted (light on dark) QRs for phone screens
        try {
          scanner.setInversionMode('both')
        } catch {
          // ignore inversion error if unsupported
        }

        try {
          await scanner.start()
          if (cancelled) {
            scanner.destroy()
            return
          }

          // Wait until the video is actually streaming NEW frames to prevent reading residual frames
          let frameCounter = 0
          const checkFreshFrame = () => {
            if (cancelled) return
            frameCounter++
            if (frameCounter >= 2) {
              canScanRef.current = true
            } else if (videoEl && 'requestVideoFrameCallback' in HTMLVideoElement.prototype) {
              videoEl.requestVideoFrameCallback(checkFreshFrame)
            } else {
              setTimeout(checkFreshFrame, 100)
            }
          }

          if (videoEl && 'requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            videoEl.requestVideoFrameCallback(checkFreshFrame)
          } else {
            // Safe fallback timer for browsers without requestVideoFrameCallback
            setTimeout(() => {
              if (!cancelled) canScanRef.current = true
            }, 300)
          }

          await loadCameras(scanner)
        } catch {
          if (!cancelled) {
            setError('Camera unavailable. Allow camera access or enter the ticket ID below.')
            setActive(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not start the scanner. Enter the ticket ID below.')
          setActive(false)
        }
      })

    const hide = () => {
      if (document.hidden) {
        canScanRef.current = false
        setActive(false)
      }
    }
    document.addEventListener('visibilitychange', hide)

    return () => {
      cancelled = true
      canScanRef.current = false
      scannerRef.current = null
      if (scanner) {
        try {
          scanner.destroy()
        } catch {
          // ignore cleanup error
        }
      }
      purgeVideoBuffer(videoEl)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [active, selectedCamera, loadCameras])

  async function handleCameraChange(deviceId) {
    setSelectedCamera(deviceId)
    try {
      localStorage.setItem('gh_admin_camera', deviceId)
    } catch {
      // Ignore localStorage issues
    }

    if (scannerRef.current) {
      canScanRef.current = false
      try {
        await scannerRef.current.setCamera(deviceId)
        const flashAvailable = await scannerRef.current.hasFlash().catch(() => false)
        setHasFlash(flashAvailable)
        setFlashOn(false)

        // Re-enable scanning after camera switch stabilizes
        setTimeout(() => {
          canScanRef.current = true
        }, 350)
      } catch {
        setError('Could not switch to the selected camera. Try restarting the scanner.')
      }
    }
  }

  async function toggleFlash() {
    if (!scannerRef.current) return
    try {
      await scannerRef.current.toggleFlash()
      const isCurrentlyOn = scannerRef.current.isFlashOn()
      setFlashOn(isCurrentlyOn)
    } catch {
      // Flash not supported on device
    }
  }

  const isDroidCam = (label = '') => label.toLowerCase().includes('droid')

  const activeCameraObj = cameras.find((c) => c.id === selectedCamera)
  const currentCameraLabel =
    activeCameraObj?.label || (selectedCamera === 'environment' ? 'Rear Camera (Default)' : 'Selected Camera')

  return (
    <div className="admin-camera-native-container">
      {/* Active State: Immersive Viewfinder with Floating Glass Controls */}
      {active ? (
        <div className="admin-camera-viewfinder">
          <video
            ref={video}
            muted
            playsInline
            aria-label="Ticket QR camera"
            className={`fit-${fitMode}`}
          />

          {/* Floating Top Glass Bar */}
          <div className="admin-camera-glass-top">
            {/* Device Switcher Pill */}
            <button
              type="button"
              className={`admin-camera-glass-pill ${isDroidCam(currentCameraLabel) ? 'droidcam' : ''}`}
              title="Select camera or virtual device"
              onClick={() => {
                loadCameras(scannerRef.current)
                setSheetOpen(true)
              }}
            >
              {isDroidCam(currentCameraLabel) ? <Smartphone size={13} /> : <Video size={13} />}
              <span className="truncate max-w-[210px] sm:max-w-[320px]">{currentCameraLabel}</span>
              <ChevronDown size={13} className="opacity-70 shrink-0" />
            </button>

            {/* Quick Actions Right (Flash when supported) */}
            {hasFlash && (
              <div className="admin-camera-glass-actions">
                <button
                  type="button"
                  className={`admin-glass-circle-btn ${flashOn ? 'active' : ''}`}
                  title={flashOn ? 'Turn off flash' : 'Turn on flash'}
                  onClick={toggleFlash}
                >
                  {flashOn ? <ZapOff size={15} /> : <Zap size={15} />}
                </button>
              </div>
            )}
          </div>

          {/* Native 4-Corner Targeting Reticle Overlay */}
          <div className="admin-scan-overlay" aria-hidden="true">
            <div className={`admin-native-reticle ${scanSuccess ? 'success' : ''}`}>
              <span className="admin-reticle-corner tl" />
              <span className="admin-reticle-corner tr" />
              <span className="admin-reticle-corner bl" />
              <span className="admin-reticle-corner br" />
              {!scanSuccess && <div className="admin-scan-laser" />}
            </div>

            {/* Translucent Guidance Pill */}
            <div className="admin-reticle-guide">
              {scanSuccess ? (
                <span className="text-[#89f5a2] font-medium flex items-center gap-1.5">
                  <Check size={13} /> Ticket Code Detected
                </span>
              ) : (
                <span>Align QR code inside frame</span>
              )}
            </div>
          </div>

          {/* Floating Bottom Glass Bar */}
          <div className="admin-camera-glass-bottom">
            <button
              type="button"
              className="admin-glass-circle-btn"
              title="Camera devices & settings"
              onClick={() => {
                loadCameras(scannerRef.current)
                setSheetOpen(true)
              }}
            >
              <SlidersHorizontal size={16} />
            </button>

            <button
              type="button"
              className="admin-glass-pause-btn"
              onClick={() => {
                setError('')
                setActive(false)
              }}
            >
              <CameraOff size={14} />
              <span>Stop Camera</span>
            </button>

            <button
              type="button"
              className={`admin-glass-circle-btn ${fitMode === 'cover' ? 'active-fill' : ''}`}
              title={fitMode === 'cover' ? 'Fit full frame (uncropped)' : 'Fill viewfinder'}
              aria-label={fitMode === 'cover' ? 'Fit full frame' : 'Fill viewfinder'}
              onClick={toggleFitMode}
            >
              {fitMode === 'cover' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      ) : (
        /* Inactive State: Focused camera viewfinder and actions */
        <div className="admin-camera-ready-card">
          <div className="admin-camera-ready-preview" aria-hidden="true">
            <div className="admin-camera-ready-halo" aria-hidden="true">
              <Camera size={23} />
            </div>
          </div>
          <div className="admin-camera-ready-actions">
            <button
              type="button"
              className="admin-camera-device-chip"
              aria-label={`Change camera. Current camera: ${currentCameraLabel}`}
              title={`Change camera · ${currentCameraLabel}`}
              onClick={() => {
                loadCameras()
                setSheetOpen(true)
              }}
            >
              <Video size={15} />
              <span>Change camera</span>
            </button>

            <button
              type="button"
              className="admin-camera-start-btn"
              onClick={() => {
                setError('')
                setActive(true)
              }}
            >
              <Camera size={17} />
              <span>Start scanner</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="admin-error mt-3" role="alert">
          {error}
        </p>
      )}

      {/* beUI BottomSheet for Camera Selection & DroidCam Guidance */}
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Select Camera Device"
        description="Choose between your built-in camera, external webcam, or DroidCam."
      >
        <div className="admin-camera-sheet-content">
          {cameras.length === 0 ? (
            <div className="p-4 rounded-xl border border-[#2b3e2c] bg-[#0c1810] text-center text-xs text-[#a2b59c]">
              <p>No extra camera devices detected yet.</p>
              <p className="mt-1 text-[11px] text-[#7d9377]">
                Start the camera once so your browser can grant permission and list all connected devices.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cameras.map((cam, idx) => {
                const isSelected = selectedCamera === cam.id
                const isDroid = isDroidCam(cam.label)
                return (
                  <button
                    key={cam.id}
                    type="button"
                    className={`admin-camera-option ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      handleCameraChange(cam.id)
                      setSheetOpen(false)
                    }}
                  >
                    <div className="admin-camera-option-meta">
                      {isDroid ? (
                        <Smartphone size={18} className="text-[#79c5f8] shrink-0" />
                      ) : (
                        <Video size={18} className="text-[#a4bc9f] shrink-0" />
                      )}
                      <div>
                        <div className="admin-camera-option-name">
                          {cam.label || `Camera ${idx + 1}`}
                        </div>
                        {isDroid && (
                          <span className="admin-camera-badge droidcam mt-1">
                            DroidCam Virtual Device
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={18} className="text-[#b7dfb6] shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* DroidCam Setup & Netlify Guide Box */}
          <div className="admin-camera-guide">
            <strong>How to use DroidCam as your camera:</strong>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li>Install <em>DroidCam</em> on your phone and <em>DroidCam Client</em> on your PC.</li>
              <li>Connect over <strong>Wi-Fi</strong> or <strong>USB cable</strong> (recommended for minimal delay).</li>
              <li>Once connected, Windows adds <strong>"DroidCam Source 1"</strong> as a virtual camera.</li>
              <li>Select it from the list above. No special Netlify server setup is needed!</li>
            </ul>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
