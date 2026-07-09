import sharp from 'sharp'
import { mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const root = 'public/recoveries'

const moves = [
  {
    storyId: 'tv-moshupa-2026-03',
    files: [
      ['Moshupa TV/20260326_115443.jpg', '01-tv-mounted-recovered.jpg'],
      ['Moshupa TV/20260326_115541.jpg', '02-recovery-team-indoor.jpg'],
      ['Moshupa TV/20260326_115551.jpg', '03-recovery-coordination-indoor.jpg'],
      ['Moshupa TV/20260326_120457.jpg', '04-tv-loaded-into-vehicle.jpg'],
      ['Moshupa TV/20260326_120503.jpg', '05-tv-carried-outdoors.jpg'],
    ],
  },
  {
    storyId: 'solar-boatle-2025-02',
    files: [
      ['Boatle Solars/IMG-20250227-WA0009.jpg', '01-panels-recovered-outdoor.jpg'],
      ['Boatle Solars/IMG-20250227-WA0010.jpg', '02-panels-stacked-close-up.jpg'],
      ['Boatle Solars/IMG-20250227-WA0011.jpg', '03-panel-surface-detail.jpg'],
      ['solar-boatle-2025-02.jpg', '04-tracking-route-map.jpg'],
    ],
  },
  {
    storyId: 'tv-gaborone-north-2024-07',
    files: [
      ['Gaborone North TV/20240723_105748.jpg', '01-mogoditshane-police-station.jpg'],
      ['Gaborone North TV/20240723_144222.jpg', '02-recovery-site-team.jpg'],
      ['Gaborone North TV/20240723_144618.jpg', '03-recovery-location-vehicle.jpg'],
      ['Gaborone North TV/Screenshot 2026-07-09 162010.png', '04-law-enforcement-on-site.jpg'],
    ],
  },
]

async function optimizeImage(inputPath, outputPath) {
  const image = sharp(inputPath).rotate()
  const meta = await image.metadata()
  const pipeline =
    meta.width && meta.width > 1600
      ? image.resize({ width: 1600, withoutEnlargement: true })
      : image

  if (outputPath.endsWith('.png')) {
    await pipeline.png({ compressionLevel: 9 }).toFile(outputPath)
  } else {
    await pipeline.jpeg({ quality: 85, mozjpeg: true }).toFile(outputPath)
  }
}

for (const { storyId, files } of moves) {
  const destDir = join(root, storyId)
  await mkdir(destDir, { recursive: true })

  for (const [srcRel, destName] of files) {
    const src = join(root, srcRel)
    if (!existsSync(src)) {
      console.warn('skip missing', src)
      continue
    }
    const ext = destName.endsWith('.png') ? '.png' : '.jpg'
    const dest = join(destDir, destName.replace(/\.(jpg|png)$/, ext))
    await optimizeImage(src, dest)
    console.log('wrote', dest)
  }
}

for (const folder of ['Moshupa TV', 'Boatle Solars', 'Gaborone North TV']) {
  const path = join(root, folder)
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true })
    console.log('removed', path)
  }
}

for (const legacy of ['tv-moshupa-2026-03.jpg', 'solar-boatle-2025-02.jpg']) {
  const path = join(root, legacy)
  if (existsSync(path)) {
    await rm(path, { force: true })
    console.log('removed legacy', path)
  }
}

console.log('done')
