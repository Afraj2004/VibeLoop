// Content for the search landing pages, built into static HTML by seo/plugin.js.
// Keep every claim true to how VibeLoop actually works.

const FEATURES = [
  ['One tap to start', 'No sign-up needed. Confirm your date of birth, accept the rules and you are talking to someone new within seconds.'],
  ['Skip any time', 'Not feeling it? Press Next and meet someone else. Press Stop when you are done.'],
  ['Filters that matter', 'Choose a country and an age range for free. Gender filters come with VibeBoost.'],
  ['Report and block in one tap', 'Blocked people are never matched with you again. Accounts reported by several different people are suspended automatically.'],
  ['Earn while you talk', 'Meet-to-Earn gives you VIBE tokens for real conversations, which you can spend on gifts and boosts.'],
  ['Friends and likes', 'Like the people you enjoy talking to, add them as friends, then message or call them again later.']
];

const SAFETY_TIPS = [
  'Never share your phone number, address, school, workplace or passwords.',
  'Do not send money or gift cards to anyone you meet.',
  'If anyone makes you uncomfortable, press Report: it ends the call and they can never be matched with you again.',
  'VibeLoop is for adults only (18+). If someone seems underage, end the call and report them.'
];

export const PAGES = [
  {
    slug: 'omegle-alternative',
    title: 'Omegle Alternative: Free 1-on-1 Video Chat with Strangers | VibeLoop',
    description: 'Looking for an Omegle alternative? VibeLoop is a free, 18+ random video chat with one-tap reporting, age and country filters, and rewards for real conversations.',
    h1: 'A safer Omegle alternative',
    intro: [
      'Omegle closed in November 2023, but the idea behind it, meeting a random person face to face, is still one of the most fun things you can do online. VibeLoop brings that back, with safety tools built in from day one.',
      'Press Start and you are connected to someone new in a live, one-to-one video call. Skip whenever you like. No account is needed to begin.'
    ],
    sections: [
      {
        heading: 'What is different from Omegle',
        bullets: [
          'Adults only: everyone confirms they are 18 or older with their date of birth before starting.',
          'One-tap Report and Block during every call, with automatic suspensions for accounts that several people report.',
          'Video goes directly between you and the other person, encrypted in transit. VibeLoop does not record or store calls.',
          'Age and country filters, so you meet the people you actually want to talk to.',
          'Rewards: earn VIBE tokens for time spent in real conversations.'
        ]
      }
    ],
    faq: [
      ['Is VibeLoop free?', 'Yes. Video chat, text chat, country and age filters are free. You can optionally buy VIBE tokens for gifts and VibeBoost.'],
      ['Do I need an account?', 'No. You can start as a guest instantly. Creating an account keeps your VIBE, friends and history across devices.'],
      ['Is VibeLoop connected to Omegle?', 'No. VibeLoop is an independent service and is not affiliated with Omegle.']
    ]
  },
  {
    slug: 'talk-to-strangers',
    title: 'Talk to Strangers Online, Face to Face | VibeLoop Video Chat',
    description: 'Talk to strangers in live one-to-one video calls. Meet people from around the world in one tap, skip any time, and stay safe with instant report and block. 18+.',
    h1: 'Talk to strangers, face to face',
    intro: [
      'Text chats get boring fast. On VibeLoop you talk to strangers in a live video call, one to one, the way real conversations happen.',
      'Every call is a surprise: a student in another country, someone who loves the same music, a person who just wants to laugh for five minutes. If the vibe is not right, press Next.'
    ],
    sections: [
      {
        heading: 'How it works',
        bullets: [
          'Open VibeLoop and press Start. Allow your camera and microphone.',
          'You are matched with a random person who is online right now.',
          'Talk, send a like or a gift, add them as a friend, or press Next to meet someone else.'
        ]
      },
      {
        heading: 'Tips for a great conversation',
        bullets: [
          'Start with a smile and a simple question: where are you from, what are you up to today?',
          'Good light and a quiet room make a big difference.',
          'Be kind. The person on the other side is real, and can report bad behaviour.'
        ]
      }
    ],
    faq: [
      ['Can I choose who I talk to?', 'You can filter by country and age range for free. Gender filters are part of VibeBoost.'],
      ['Can I talk to the same person again?', 'Yes. Add them as a friend during the call, then message or call them from your Friends list.'],
      ['Can people record me?', 'Our rules forbid recording anyone without their consent. Report anyone who does and they are removed.']
    ]
  },
  {
    slug: 'video-chat-india',
    title: 'Random Video Chat in India: Meet New People | VibeLoop',
    description: 'Random video chat with people from India and around the world. Filter by country and age, earn VIBE tokens as you chat, and report anyone in one tap. Free, 18+.',
    h1: 'Random video chat in India',
    intro: [
      'VibeLoop is built in India for people who want to meet someone new without the noise of social media. Set the country filter to India to talk to people near you, or open it up to the whole world.',
      'It runs in your browser on any phone or laptop. There is nothing to install.'
    ],
    sections: [
      {
        heading: 'Made for India',
        bullets: [
          'Country filter: meet people from India, or anywhere else.',
          'Prices in rupees for optional VIBE packs, paid securely through Razorpay with UPI, cards or net banking.',
          'Works on mobile data: calls keep going through a short network drop, like switching from Wi-Fi to 4G.',
          'A grievance officer and clear rules under Indian law. See our Terms and Privacy Policy.'
        ]
      }
    ],
    faq: [
      ['Is VibeLoop free in India?', 'Yes. Matching, video and text chat are free. VIBE packs are optional.'],
      ['Which language can I speak?', 'Any. Many people speak English or Hindi, and you can use the country filter to meet people who share your language.'],
      ['What age do I have to be?', 'VibeLoop is strictly 18+. You enter your date of birth before you start.']
    ]
  }
];

export const SHARED = { FEATURES, SAFETY_TIPS };
