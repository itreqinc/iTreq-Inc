/**
 * Success story records for the public highlights page.
 *
 * When adding a recovery from a client narrative:
 * - Use general area only (city/region), never exact addresses
 * - No client names, plate numbers, or case numbers
 * - Set photos in `public/recoveries/<story-id>/` with numbered descriptive filenames
 */

function storyPhotos(storyId, files) {
  return files.map((file) => `/recoveries/${storyId}/${file}`)
}

export const RECOVERY_PROCESS = [
  {
    step: 1,
    title: 'Asset reported missing',
    description:
      'The client alerts iTreq Inc that a tracked vehicle or asset may have been stolen or moved without permission.',
  },
  {
    step: 2,
    title: 'Live tracking activated',
    description:
      'Our team monitors the device in real time and works to establish a clear, up-to-date location for recovery.',
  },
  {
    step: 3,
    title: 'Law enforcement coordination',
    description:
      'Recovery is planned and carried out in coordination with law enforcement officers — we support officers with tracking visibility on site.',
  },
  {
    step: 4,
    title: 'Asset recovered',
    description:
      'The tracked item is located and recovered alongside law enforcement, then returned through the proper process.',
  },
]

export const ASSET_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'appliance', label: 'TVs & home' },
  { id: 'laptop', label: 'Laptops' },
  { id: 'vehicle', label: 'Vehicles' },
  { id: 'solar', label: 'Solar' },
  { id: 'equipment', label: 'Equipment' },
]

const RECOVERY_STORIES_UNSORTED = [
  {
    id: 'tv-moshupa-2026-03',
    assetType: 'appliance',
    assetLabel: 'Television',
    location: 'Moshupa — Mmaseetsele Ward / Metsimotlhabe',
    date: '2026-03',
    recoveredWithPolice: true,
    policeUnits: 'Moshupa CID & Mogoditshane CID',
    headline: 'Tracked TV recovered after backup battery challenge',
    summary:
      'A television was stolen on a Monday night from Moshupa (Mmaseetsele Ward) and reported to iTreq Inc the following Tuesday morning. Because the TV was not used on a daily basis, the tracker’s backup battery had drained — which extended the time needed to re-establish a live position. Recovery was carried out on the Thursday in Metsimotlhabe.',
    highlights: [
      'Reported Tuesday morning after a Monday-night theft in Moshupa',
      'Recovery completed on the Thursday in Metsimotlhabe',
      'Moshupa CID worked in collaboration with Mogoditshane CID',
      'Backup battery had drained because the TV was rarely switched on — a reminder to power tracked assets periodically',
    ],
    photos: storyPhotos('tv-moshupa-2026-03', [
      '01-tv-mounted-recovered.jpg',
      '02-recovery-team-indoor.jpg',
      '03-recovery-coordination-indoor.jpg',
      '04-tv-loaded-into-vehicle.jpg',
      '05-tv-carried-outdoors.jpg',
    ]),
  },
  {
    id: 'solar-boatle-2025-02',
    assetType: 'solar',
    assetLabel: 'Solar panels',
    location: 'Boatle / Kanye',
    date: '2025-02',
    recoveredWithPolice: true,
    policeUnits: 'Ramotswa Police Station',
    headline: 'Same-day solar panel recovery — stolen overnight, back by afternoon',
    summary:
      'A bracket installation held ten solar panels, with two fitted with iTreq trackers on 14 February. Overnight at around 01:16, three panels were taken — one tracked panel and two without trackers. The other tracked panel on the bracket was not stolen. iTreq Inc’s monitoring team picked up the movement and alerted the owner that solar panels had been stolen — our team stays online around the clock to check tracker health and unusual activity. The stolen tracked panel’s live position that morning directed a same-day recovery in Kanye through Ramotswa Police Station, and all three stolen panels were recovered.',
    highlights: [
      'Trackers fitted on 14 February; movement on the stolen panel detected around 01:16 overnight',
      'Owner was alerted by iTreq Inc that panels had been stolen — not the other way around',
      'Our monitoring team stays online to check tracker health and flag theft in real time',
      'Ten panels on the bracket — two tracked; three stolen (one tracked, two untracked)',
      'Stolen in Boatle and recovered the same day in Kanye',
      'The remaining tracked panel on the bracket was not part of the theft',
      'Recovery coordinated through Ramotswa Police Station',
    ],
    photos: storyPhotos('solar-boatle-2025-02', [
      '01-panels-recovered-outdoor.jpg',
      '02-panels-stacked-close-up.jpg',
      '03-panel-surface-detail.jpg',
      '04-tracking-route-map.jpg',
    ]),
  },
  {
    id: 'tv-gaborone-north-2024-07',
    assetType: 'appliance',
    assetLabel: 'Television',
    location: 'Gaborone North — Gabane / Tsolamosese',
    date: '2024-07',
    recoveredWithPolice: true,
    policeUnits: 'SSKIA Police & Mogoditshane CID',
    headline: 'Overnight TV theft recovered by morning — and linked to wider haul',
    summary:
      'On the night of 22 July 2024, a television was stolen from a home in Gaborone North despite a dog and electric fence on the property. The owner called the next morning and iTreq tracking showed the TV in Tsolamosese. It was later recovered in Gabane through Sir Seretse Khama International Airport Police working with Mogoditshane CID.',
    highlights: [
      'Theft occurred overnight; owner reported and tracking was activated the following morning',
      'Morning location data in Tsolamosese supported a recovery operation in Gabane',
      'Although the TV had already been sold on, the tracking lead helped recover other stolen goods',
      'More than 11 laptops from separate robbery cases were recovered from the same location',
    ],
    photos: storyPhotos('tv-gaborone-north-2024-07', [
      '01-mogoditshane-police-station.jpg',
      '02-recovery-site-team.jpg',
      '03-recovery-location-vehicle.jpg',
      '04-law-enforcement-on-site.jpg',
    ]),
  },
  {
    id: 'laptop-gaborone-west-2021-04',
    assetType: 'laptop',
    assetLabel: 'Laptop',
    location: 'Gaborone — Block 5 / Oodi',
    date: '2021-04',
    recoveredWithPolice: true,
    policeUnits: 'Gaborone West Police & Oodi Police',
    headline: 'Tracked laptop leads to full house burglary recovery',
    summary:
      'In April 2021, a tracked laptop was stolen during a burglary in Gaborone Block 5 where nearly everything in the home was taken. The owner was advised to report the theft to Gaborone West Police, with tracking support from iTreq Inc.',
    highlights: [
      'Tracked laptop helped direct a coordinated recovery effort',
      'Items recovered from Oodi with Gaborone West and Oodi Police working together',
      'Recovery covered property taken in what appeared to be a full household theft',
    ],
    photos: [],
  },
  {
    id: 'tv-broadhurst-2019-03',
    assetType: 'appliance',
    assetLabel: 'Television',
    location: 'Gaborone — Block 3 / Tsholofelo',
    date: '2019-03',
    recoveredWithPolice: true,
    policeUnits: 'Broadhurst Police',
    headline: 'Our very first recovery — tracked TV after a daytime break-in',
    summary:
      'In March 2019, a homeowner returned from work around mid-morning to find their house broken into. A tracked television was among items taken, along with shoes, clothes and other valuables. The owner reported the theft to Broadhurst Police and confirmed the TV was actively tracked.',
    highlights: [
      'iTreq Inc’s first documented recovery operation',
      'Tracked TV located and recovery instituted through Broadhurst Police',
      'Television and all stolen household items recovered a short distance from the station in Tsholofelo',
      'Firearms recovered with the stolen goods, indicating the break-in may have been an armed robbery',
    ],
    photos: [],
  },
]

export const RECOVERY_STORIES = [...RECOVERY_STORIES_UNSORTED].sort((a, b) =>
  b.date.localeCompare(a.date),
)

export function formatRecoveryDate(dateStr) {
  const [year, month] = dateStr.split('-')
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const m = months[Number(month) - 1]
  return m ? `${m} ${year}` : dateStr
}

export const ASSET_ICONS = {
  vehicle: 'car',
  solar: 'battery',
  equipment: 'equipment',
  generator: 'generator',
  appliance: 'tv',
  laptop: 'laptop',
  default: 'recovery',
}
