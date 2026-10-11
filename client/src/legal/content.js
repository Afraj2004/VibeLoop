// Terms of Service and Privacy Policy. Keep in sync with what the code actually does,
// and bump TERMS_VERSION (components/overlays/ConsentModal.jsx) when changing them.

export const LEGAL_CONTACT = 'support@vibeloop.com';
export const LEGAL_EFFECTIVE_DATE = '10 October 2026';

export const TERMS = {
  title: 'Terms of Service',
  intro:
    'These Terms govern your use of VibeLoop, a service that connects you in live, one-to-one video calls with other adults. VibeLoop is operated from Bengaluru, Karnataka, India ("VibeLoop", "we", "us"). By using VibeLoop you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the service.',
  sections: [
    {
      heading: '1. Eligibility',
      paragraphs: [
        'You must be at least 18 years old to use VibeLoop. By using the service you confirm that you are 18 or older and legally able to accept these Terms. If we learn that a user is under 18, we will suspend and delete the account.'
      ]
    },
    {
      heading: '2. Accounts',
      paragraphs: [
        'You can use VibeLoop as a guest or create an account with an email address and password. You are responsible for keeping your password secure and for activity on your account. Guest sessions are tied to your browser; clearing your browser data ends the guest session and its balance.'
      ]
    },
    {
      heading: '3. Community Guidelines',
      paragraphs: ['You agree not to:'],
      bullets: [
        'show nudity, sexual content or engage in sexual behaviour on camera;',
        'harass, threaten, bully or abuse anyone, or post hate speech;',
        'record, screenshot, stream or share another user without their explicit consent;',
        'involve or depict anyone under 18;',
        'spam, advertise, scam or solicit money;',
        'impersonate anyone, or use bots, scripts or multiple accounts to manipulate matching, rewards or reports;',
        'break any applicable law.'
      ]
    },
    {
      heading: '4. Moderation, reports and suspensions',
      paragraphs: [
        'You can report or block anyone you meet. Reports are stored and may be reviewed by our team. An account that receives reports from several different users within 24 hours is automatically suspended for 24 hours. We may also suspend or permanently ban accounts, remove content, or forfeit tokens at our discretion when we believe these Terms have been broken, including without prior notice.',
        'If you believe a suspension was a mistake, contact us at the address below.'
      ]
    },
    {
      heading: '5. VIBE tokens',
      paragraphs: [
        'VIBE tokens are a virtual, in-app item. They are not money, have no cash value, cannot be transferred outside VibeLoop, and are not a security or investment. You can earn a limited number of tokens through active video time (currently up to 10 per day) and spend them on in-app gifts for other users.',
        'Half of the value of gifts you receive is recorded as an earned balance. Any future ability to redeem earned balances will be subject to separate terms, verification and applicable law; until then it has no cash value. We may adjust or remove tokens obtained through bugs, abuse or breaches of these Terms, and may change token rules, prices and gift items at any time.'
      ]
    },
    {
      heading: '6. Your content and other users',
      paragraphs: [
        'Video and audio are sent directly between you and the person you are matched with and are not recorded by VibeLoop. You are responsible for what you show and say. Other users are strangers: VibeLoop does not verify identities and is not responsible for the conduct of other users, on or off the service. Never share personal information you would not want made public.'
      ]
    },
    {
      heading: '7. Service availability',
      paragraphs: [
        'VibeLoop is provided "as is" and "as available". We do not guarantee that the service will be uninterrupted, error-free, or that you will be matched with anyone. We may change, suspend or discontinue features at any time.'
      ]
    },
    {
      heading: '8. Limitation of liability',
      paragraphs: [
        'To the maximum extent permitted by law, VibeLoop is not liable for any indirect, incidental, special or consequential damages, or for any loss arising from your interactions with other users. Nothing in these Terms limits liability that cannot be limited under applicable law.'
      ]
    },
    {
      heading: '9. Ending your use',
      paragraphs: [
        'You can stop using VibeLoop and delete your account at any time from "Your account & data" in the app. Deleting your account permanently removes your tokens, including any earned balance. We may suspend or terminate your access if you break these Terms.'
      ]
    },
    {
      heading: '10. Governing law',
      paragraphs: [
        'These Terms are governed by the laws of India. The courts at Bengaluru, Karnataka have exclusive jurisdiction over any dispute arising from them.'
      ]
    },
    {
      heading: '11. Changes',
      paragraphs: [
        'We may update these Terms. When we make material changes we will ask you to accept the new version before you continue using VibeLoop.'
      ]
    },
    {
      heading: '12. Contact',
      paragraphs: [`Questions, appeals and complaints: ${LEGAL_CONTACT}`]
    }
  ]
};

export const PRIVACY = {
  title: 'Privacy Policy',
  intro:
    'This policy explains what personal data VibeLoop collects, why, who it is shared with and the choices you have. It is written to meet India\'s Digital Personal Data Protection Act, 2023 and the Information Technology Rules.',
  sections: [
    {
      heading: '1. Your video and audio',
      paragraphs: [
        'Calls are peer-to-peer and encrypted end to end in transit (WebRTC DTLS-SRTP). VibeLoop does not record, store or view your video or audio. On some networks the encrypted stream passes through a relay server (Cloudflare) that cannot decrypt it.'
      ]
    },
    {
      heading: '2. Data we collect',
      bullets: [
        'Account: username, and if you register, your email address and a hashed password. Guests get a randomly generated username.',
        'Profile you choose to set: gender and country, used only for match filters.',
        'Consent records: when you confirmed you are 18+ and accepted the Terms, and which version.',
        'Activity: who you were matched with for 20 seconds or more and for how long; in-call chat messages (only the last 30 per conversation are kept); VIBE token balances and transactions; gifts sent and received.',
        'Safety: reports you file (including your IP address at the time, used to stop fake mass-reporting), reports about you, blocks, and any suspensions.',
        'Technical: IP address (used for rate limiting and security), browser information needed to set up calls, and server logs kept by our hosting providers.'
      ]
    },
    {
      heading: '3. Why we use it',
      bullets: [
        'to connect you with other users according to your filters;',
        'to run token rewards, gifts and your recent-contacts list;',
        'to keep the service safe: enforcing the Community Guidelines, investigating reports, preventing spam, fraud and abuse;',
        'to comply with law and respond to lawful requests.'
      ],
      paragraphs: ['We do not sell your personal data and do not use it for advertising.']
    },
    {
      heading: '4. Who we share it with',
      paragraphs: [
        'The person you are matched with sees your video, audio, username, country (if set) and chat messages. We use these service providers to run VibeLoop, who process data only on our instructions: Render (application hosting), Vercel (website hosting), Supabase (database), Upstash (in-memory data store), Cloudflare (call relay) and Better Stack (uptime monitoring). Google\'s public STUN servers help your browser find a network route for calls. These providers may store data in India or other countries, including the United States. We may disclose data where required by law or to protect users\' safety.'
      ]
    },
    {
      heading: '5. How long we keep it',
      bullets: [
        'Account, balances, transactions and match history: until you delete your account.',
        'Recent contacts list: 30 days.',
        'Chat messages: only the most recent 30 per pair of users.',
        'Reward counters: 2 days. Rate-limit counters: up to 1 hour.',
        'Reports you filed: kept for safety review after you delete your account, but your identity and IP address are removed. Reports about you are deleted with your account.',
        'A record of moderation decisions (without your profile data) is kept for accountability.'
      ]
    },
    {
      heading: '6. Your rights and choices',
      paragraphs: [
        'You can download a copy of your data or permanently delete your account at any time from "Your account & data" in the app. You can also ask us to access, correct or erase your data, withdraw consent, or nominate another person to exercise your rights, by writing to us. Withdrawing consent means you can no longer use VibeLoop.'
      ]
    },
    {
      heading: '7. Data stored on your device',
      paragraphs: [
        'VibeLoop stores your session token, basic profile, filter preferences and your Terms acceptance in your browser\'s local storage. We do not use advertising or tracking cookies.'
      ]
    },
    {
      heading: '8. Children',
      paragraphs: [
        'VibeLoop is only for adults aged 18 and over. We do not knowingly process data of anyone under 18 and will delete it when we learn of it. Please report any user who appears to be under 18.'
      ]
    },
    {
      heading: '9. Security',
      paragraphs: [
        'Passwords are hashed, connections use HTTPS, and access to data is restricted. No system is perfectly secure; if a breach affects your data we will notify you and the authorities as required by law.'
      ]
    },
    {
      heading: '10. Grievance Officer',
      paragraphs: [
        `Grievance Officer, VibeLoop, Bengaluru, Karnataka, India. Email: ${LEGAL_CONTACT}. We acknowledge complaints within 24 hours and aim to resolve them within 15 days. If you are not satisfied with our response, you may complain to the Data Protection Board of India.`
      ]
    },
    {
      heading: '11. Changes',
      paragraphs: [
        'We may update this policy. We will notify you of material changes in the app before they take effect.'
      ]
    }
  ]
};
