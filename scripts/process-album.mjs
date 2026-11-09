import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

const SOURCE_DIR = path.join(ROOT_DIR, 'album-source')
const PUBLIC_GALLERY_DIR = path.join(ROOT_DIR, 'public', 'gallery')
const ORIGINALS_DIR = path.join(PUBLIC_GALLERY_DIR, 'originals')
const THUMBS_DIR = path.join(PUBLIC_GALLERY_DIR, 'thumbs')
const MANIFEST_PATH = path.join(PUBLIC_GALLERY_DIR, 'space-manifest.json')

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp', '.heic'])

function ensureDirectories() {
  for (const dir of [SOURCE_DIR, PUBLIC_GALLERY_DIR, ORIGINALS_DIR, THUMBS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

function findImagesRecursively(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(findImagesRecursively(fullPath))
    } else {
      const ext = path.extname(entry.name).toLowerCase()
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(fullPath)
      }
    }
  }
  return results
}

// Generate spiral galaxy coordinates in 3D (non-connected, free-floating stars)
function calculateGalaxyCoordinates(index, total) {
  const arms = 3
  const arm = index % arms
  const armAngle = (arm * 2 * Math.PI) / arms
  const progress = index / Math.max(1, total)
  
  // Golden ratio spread along galaxy arms
  const distance = 260 + Math.sqrt(progress) * 1200
  const angle = armAngle + progress * 7.5 + (Math.random() - 0.5) * 0.4
  
  // Height / disk thickness with vertical jitter
  const heightSpread = 160 * (1 - progress * 0.35)
  const z = (Math.sin(index * 1.7) * 0.5 + (Math.random() - 0.5)) * heightSpread
  
  const x = Math.cos(angle) * distance
  const y = Math.sin(angle) * distance
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
    orbitRadius: Math.round(distance),
    arm,
  }
}

async function processImage(imagePath, index, existingTags = []) {
  const filename = path.basename(imagePath)
  const cleanName = filename.replace(/\s+/g, '_')
  const ext = path.extname(filename).toLowerCase()
  const baseName = path.basename(filename, ext)
  
  const originalDest = path.join(ORIGINALS_DIR, cleanName)
  const thumbFilename = `${baseName}_thumb.webp`
  const thumbDest = path.join(THUMBS_DIR, thumbFilename)
  
  // 1. Copy pristine untouched full-resolution original (zero compression)
  if (!fs.existsSync(originalDest) || fs.statSync(imagePath).size !== fs.statSync(originalDest).size) {
    fs.copyFileSync(imagePath, originalDest)
  }
  
  // 2. Read dimensions & metadata
  const metadata = await sharp(imagePath).metadata()
  const width = metadata.width || 1920
  const height = metadata.height || 1080
  
  // 3. Generate high-speed LOD WebP texture for 3D space billboards (380px wide, ~20KB)
  if (!fs.existsSync(thumbDest)) {
    await sharp(imagePath)
      .rotate() // auto-orient from EXIF
      .resize({ width: 380, withoutEnlargement: true })
      .webp({ quality: 82, effort: 3 })
      .toFile(thumbDest)
  }
  
  return {
    id: `photo_${String(index + 1).padStart(3, '0')}`,
    filename: cleanName,
    title: baseName.replace(/[-_]/g, ' '),
    originalUrl: `/gallery/originals/${cleanName}`,
    thumbnailUrl: `/gallery/thumbs/${thumbFilename}`,
    width,
    height,
    aspectRatio: Number((width / height).toFixed(3)),
    tags: existingTags, // user-submitted GH ticket references & nicknames
  }
}

async function main() {
  console.log('🌌 Starting Fast Space Gallery Processor...')
  ensureDirectories()
  
  // Preserve existing user tags if manifest already exists
  let previousTagsMap = new Map()
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
      if (Array.isArray(prev.photos)) {
        prev.photos.forEach((p) => {
          if (p.filename && Array.isArray(p.tags)) {
            previousTagsMap.set(p.filename, p.tags)
          }
        })
      }
    } catch {
      // ignore
    }
  }
  
  let imageFiles = findImagesRecursively(SOURCE_DIR)
  
  if (imageFiles.length === 0) {
    console.log(`📁 Notice: "${SOURCE_DIR}" is empty.`)
    console.log('Drop your 1.5 GB album images into "album-source/" and run: npm run gallery:process\n')
    
    // Check if we have sample images in public/images for demo
    const sampleImages = findImagesRecursively(path.join(ROOT_DIR, 'public', 'images'))
    if (sampleImages.length > 0) {
      console.log(`Using ${sampleImages.length} sample images from public/images for galaxy preview.`)
      imageFiles = sampleImages
    }
  } else {
    console.log(`📸 Found ${imageFiles.length} photos in album-source/. Processing...`)
  }
  
  const photos = []
  
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i]
    const cleanFilename = path.basename(file).replace(/\s+/g, '_')
    const existingTags = previousTagsMap.get(cleanFilename) || []
    
    const result = await processImage(file, i, existingTags)
    result.spaceCoords = calculateGalaxyCoordinates(i, imageFiles.length)
    photos.push(result)
  }
  
  const manifest = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    totalPhotos: photos.length,
    photos,
  }
  
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`✨ Successfully generated Space Manifest: ${MANIFEST_PATH}`)
  console.log(`🚀 ${photos.length} photos ready for 3D space exploration!`)
}

main().catch((err) => {
  console.error('Error during gallery processing:', err)
  process.exit(1)
})
