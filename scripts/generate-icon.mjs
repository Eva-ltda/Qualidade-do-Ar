import fs from 'node:fs'
import path from 'node:path'
import toIco from 'to-ico'
import { Jimp } from 'jimp'

const root = process.cwd()
const inputPng = path.join(root, 'Logo.png')
const outDir = path.join(root, 'build')
const outIco = path.join(outDir, 'icon.ico')

if (!fs.existsSync(inputPng)) {
  throw new Error(`Logo.png não encontrado em: ${inputPng}`)
}

fs.mkdirSync(outDir, { recursive: true })

const source = await Jimp.read(inputPng)

const threshold = 42
source.scan(0, 0, source.bitmap.width, source.bitmap.height, function (_x, _y, idx) {
  const r = this.bitmap.data[idx + 0]
  const g = this.bitmap.data[idx + 1]
  const b = this.bitmap.data[idx + 2]
  const a = this.bitmap.data[idx + 3]
  if (a === 0) return
  if (r < threshold && g < threshold && b < threshold) {
    this.bitmap.data[idx + 3] = 0
  }
})

const sizes = [256, 128, 64, 48, 32, 24, 16]
const pngBuffers = await Promise.all(
  sizes.map(async (s) => {
    const img = source.clone().contain({ w: s, h: s })
    return img.getBuffer('image/png')
  }),
)

const ico = await toIco(pngBuffers)
fs.writeFileSync(outIco, ico)
