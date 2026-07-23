import path from 'node:path'
import { promises as fs } from 'node:fs'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const outputDirectory = path.resolve('resources', 'icons')

const iconSvg = String.raw`
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="background" x1="120" y1="80" x2="900" y2="944" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#172554"/>
      <stop offset="0.52" stop-color="#0f3b68"/>
      <stop offset="1" stop-color="#075985"/>
    </linearGradient>
    <linearGradient id="screen" x1="266" y1="270" x2="794" y2="744" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f8fafc" stop-opacity=".98"/>
      <stop offset="1" stop-color="#dff7ff" stop-opacity=".94"/>
    </linearGradient>
    <linearGradient id="play" x1="430" y1="383" x2="654" y2="637" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#0284c7"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="34" stdDeviation="34" flood-color="#020617" flood-opacity=".38"/>
    </filter>
    <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>

  <rect x="52" y="52" width="920" height="920" rx="214" fill="url(#background)"/>
  <path d="M172 730C328 891 651 946 870 737" fill="none" stroke="#38bdf8" stroke-opacity=".16" stroke-width="70" stroke-linecap="round"/>
  <circle cx="790" cy="212" r="118" fill="#67e8f9" opacity=".1" filter="url(#softGlow)"/>

  <g filter="url(#shadow)">
    <rect x="204" y="238" width="616" height="510" rx="70" fill="#082f49" stroke="#67e8f9" stroke-width="20"/>
    <rect x="250" y="284" width="524" height="380" rx="38" fill="url(#screen)"/>
    <path d="M250 626h524v0c0 21-17 38-38 38H288c-21 0-38-17-38-38v0Z" fill="#d8f3fa"/>

    <path d="M465 395c0-21 23-34 41-23l159 99c17 11 17 36 0 47l-159 99c-18 11-41-2-41-23V395Z" fill="url(#play)"/>
    <circle cx="512" cy="714" r="18" fill="#67e8f9"/>
  </g>

  <g fill="#f8fafc" stroke="#0e7490" stroke-width="14">
    <rect x="132" y="338" width="122" height="88" rx="25"/>
    <rect x="132" y="468" width="122" height="88" rx="25"/>
    <rect x="132" y="598" width="122" height="88" rx="25"/>
  </g>
  <g fill="#06b6d4">
    <circle cx="172" cy="382" r="12"/>
    <path d="M198 365h28v34h-28z"/>
    <path d="M161 512h64" stroke="#06b6d4" stroke-width="17" stroke-linecap="round"/>
    <path d="M161 642h64" stroke="#06b6d4" stroke-width="17" stroke-linecap="round"/>
  </g>
</svg>
`

async function main(): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true })

  const source = Buffer.from(iconSvg)
  const pngPath = path.join(outputDirectory, 'icon.png')
  const png = await sharp(source).resize(1024, 1024).png({ compressionLevel: 9 }).toBuffer()
  await fs.writeFile(pngPath, png)

  const icoSizes = [256, 128, 64, 48, 32, 16]
  const icoImages = await Promise.all(
    icoSizes.map((size) =>
      sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
    ),
  )
  const ico = await pngToIco(icoImages)
  await fs.writeFile(path.join(outputDirectory, 'icon.ico'), ico)

  console.log(`已生成应用图标：${pngPath}`)
}

main().catch((error: unknown) => {
  console.error('生成应用图标失败', error)
  process.exitCode = 1
})
