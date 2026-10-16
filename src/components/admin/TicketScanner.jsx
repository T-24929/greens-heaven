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

export default function TicketScanner({ onScan }) {
  const video = useRef(null)
  const scannerRef = useRef(null)
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
  const [fitMode, setFitMode] = useState('contain') // 'contain' prevents cropping; 'cover' fills
  const [sheetOpen, setSheetOpen] = useState(false)
  const [hasFlash, setHasFlash] = useState(false)
  const [flashOn, setFlashOn] = useState(false)

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

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let scanner = null

    import('qr-scanner')
      .then(async ({ default: QrScanner }) => {
        if (cancelled || !video.current) return

        scanner = new QrScanner(
          video.current,
          (result) => {
            scanner.stop()
            setActive(false)
            callback.current(result.data)
          },
          {
            preferredCamera: selectedCamera,
            maxScansPerSecond: 6,
            returnDetailedScanResult: true,
            highlightScanRegion: false, // We supply a custom non-clipping overlay guide
            highlightCodeOutline: true,
          }
        )
        scannerRef.current = scanner

        try {
          await scanner.start()
          if (cancelled) {
            scanner.destroy()
            return
          }
          await loadCameras(scanner)
        } catch {
          if (!cancelled) {
            setError('Camera unavailable. Allow camera access, or enter the ticket reference below.')
            setActive(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not start the scanner. Enter the ticket reference below.')
          setActive(false)
        }
      })

    const hide = () => {
      if (document.hidden) setActive(false)
    }
    document.addEventListener('visibilitychange', hide)

    return () => {
      cancelled = true
      scannerRef.current = null
      scanner?.destroy()
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
      try {
        await scannerRef.current.setCamera(deviceId)
        const flashAvailable = await scannerRef.current.hasFlash().catch(() => false)
        setHasFlash(flashAvailable)
        setFlashOn(false)
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
    <div className="admin-camera">
      {/* Active Scanner Top Toolbar */}
      {active && (
        <div className="admin-camera-toolbar">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`admin-camera-badge ${isDroidCam(currentCameraLabel) ? 'droidcam' : ''}`}
              title={currentCameraLabel}
            >
              {isDroidCam(currentCameraLabel) ? <Smartphone size={12} /> : <Video size={12} />}
              <span className="truncate max-w-[130px] sm:max-w-[180px]">{currentCameraLabel}</span>
            </span>

            {/* In-view quick dropdown */}
            {cameras.length > 1 && (
              <select
                aria-label="Quick camera switcher"
                value={selectedCamera}
                onChange={(e) => handleCameraChange(e.target.value)}
                className="bg-[#0e1d13] text-[#d8e5cd] text-[11px] border border-[#263c2a] rounded-lg px-2 py-1 outline-none"
              >
                {cameras.map((cam, idx) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="admin-camera-actions">
            {/* Fit mode toggle (contain vs cover) */}
            <button
              type="button"
              className="admin-icon"
              title={fitMode === 'contain' ? 'Switch to Crop/Fill' : 'Switch to Full Uncropped'}
              onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
            >
              {fitMode === 'contain' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>

            {/* Flashlight toggle */}
            {hasFlash && (
              <button
                type="button"
                className="admin-icon"
                title={flashOn ? 'Turn off flash' : 'Turn on flash'}
                onClick={toggleFlash}
              >
                {flashOn ? <ZapOff size={16} /> : <Zap size={16} />}
              </button>
            )}

            {/* Open beUI BottomSheet */}
            <button
              type="button"
              className="admin-icon"
              title="Camera settings & devices"
              onClick={() => {
                loadCameras(scannerRef.current)
                setSheetOpen(true)
              }}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Viewfinder with uncropped container */}
      <div className="admin-camera-viewfinder" hidden={!active}>
        <video
          ref={video}
          muted
          playsInline
          aria-label="Ticket QR camera"
          className={`fit-${fitMode}`}
        />
        <div className="admin-scan-overlay" aria-hidden="true">
          <div className="admin-scan-box" />
        </div>
      </div>

      {/* Inactive Placeholder */}
      {!active && (
        <div className="admin-camera-placeholder">
          <Camera size={34} />
          <p>Scan an attendee ticket QR</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#91a78a]">
              {selectedCamera === 'environment'
                ? 'Rear camera / Default'
                : currentCameraLabel}
            </span>
            {cameras.length > 0 && (
              <button
                type="button"
                className="text-xs text-[#b8dfb6] underline cursor-pointer"
                onClick={() => setSheetOpen(true)}
              >
                Change
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <button
          type="button"
          className="admin-button"
          onClick={() => {
            setError('')
            setActive((value) => !value)
          }}
        >
          {active ? <CameraOff size={18} /> : <Camera size={18} />}
          {active ? 'Stop camera' : 'Start camera'}
        </button>

        {!active && (
          <button
            type="button"
            className="admin-icon"
            title="Choose camera device (DroidCam / Webcams)"
            onClick={() => {
              loadCameras()
              setSheetOpen(true)
            }}
          >
            <SlidersHorizontal size={18} />
          </button>
        )}
      </div>

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
