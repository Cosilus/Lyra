// Wallet FAQ shown by the Help button: only how the wallet itself works
// (the marketing questions live on the website). Keep answers short, and
// only say what the wallet really does. `chips` are example sentences the
// user can tap to drop into the message box.
export const HELP_FAQ = [
  {
    id: "message",
    label: "Message Lyra",
    items: [
      {
        q: "Can I really do everything by messaging Lyra?",
        a: "Yes. Every option, feature and interaction of the wallet can be done by writing a sentence in the Message Lyra box. The menus and buttons are only shortcuts, you never need them. Lyra only prepares: anything that moves money waits for you to hold the confirm button, even when you asked in the chat.",
      },
      {
        q: "Move money",
        a: "Say what you want, in your own words.",
        chips: [
          "Send 10 USDT to Alex",
          "Swap 50 USDT to XPL",
          "Bridge 5 XPL to Base",
          "Stake 100 USDT",
          "Top up my wallet with $50",
          "Cash out $100",
        ],
      },
      {
        q: "Look things up, open any screen",
        a: "Ask for information, or name the screen you want. You can also change network or interface, or lock the wallet.",
        chips: [
          "What is my balance?",
          "Show my address",
          "Show my transaction history",
          "Open my contacts",
          "Open settings",
          "Show my recovery phrase",
          "Switch to Base",
          "Switch to 3D",
          "Lock my wallet",
        ],
      },
      {
        q: "Several things at once, or Lyra does not understand",
        a: "Chain steps in one sentence and Lyra prepares each as its own ticket. If something is missing (an amount, an address, the token to receive, a network), Lyra asks for it first and prepares the ticket only once it has everything. If it does not understand, rephrase briefly, or write \"what can you do\" to see everything.",
        chips: ["Swap 1,200 XPL to USDT0 and stake it", "What can you do?"],
      },
    ],
  },
  {
    id: "basics",
    label: "The basics",
    items: [
      {
        q: "How do I add funds?",
        a: "On an empty wallet, tap Copy address (or the QR code) on the home screen, then send crypto to it from an exchange or another wallet. You can also tell Lyra \"top up my wallet with $50\" to buy crypto with a card or bank transfer.",
      },
      {
        q: "Which networks can I use?",
        a: "Plasma, Ethereum, Base, Polygon, Arc and Hyperliquid. Pick one from the Network button in your menu, or say \"switch to Base\". Your balance and history always show the network you are on.",
      },
      {
        q: "Is my address the same on every network?",
        a: "Yes. One address works on every EVM network. Switching network only changes which chain's balance and activity you are looking at.",
      },
      {
        q: "Do I need an account, and does it cost anything?",
        a: "No account or sign-up: the wallet lives on your device. The only cost on a transaction is the network fee the chain charges, shown on the ticket before you confirm.",
      },
    ],
  },
  {
    id: "send",
    label: "Send & receive",
    items: [
      {
        q: "How do I send something?",
        a: "Tell Lyra, for example \"Send 10 USDT to Alex\", or paste an address. Lyra opens a ticket with the amount, the full recipient address, the network and the fee. Check it, then hold the confirm button to send.",
      },
      {
        q: "Why do I have to hold the button?",
        a: "Holding for a moment is much harder to do by accident than a tap. It is the same gesture for every transaction, whether you send, swap, bridge or stake. You can close a ticket at any time and nothing is sent.",
      },
      {
        q: "What if I paste the wrong address?",
        a: "Lyra warns you when an address looks almost identical to one of your contacts but is not the same, or when an on-chain check finds something suspicious. A blockchain transfer cannot be undone, so always compare the full address shown in the ticket.",
      },
      {
        q: "How do I receive funds?",
        a: "Use Copy address or the QR code on the home screen, or ask Lyra for your address. The same address works on any EVM chain and for any token. If something arrives on a network Lyra does not follow yet, ask Lyra to consolidate it and it will bring it back to your main balance.",
      },
      {
        q: "Where is my transaction history?",
        a: "In 3D, the right-hand menu has one button each for Send, Receive, Swap, Bridge and Stake. In 2D, open Menu and choose History. Tap a line to see it on the block explorer. Deposits update your balance on their own.",
      },
      {
        q: "How do contacts work?",
        a: "A contact is a name for an address. After you send to a new address Lyra offers to save it, or you can add one from Contacts. Then you can just say \"Send 10 USDT to Alex\".",
      },
    ],
  },
  {
    id: "actions",
    label: "Swap, bridge, stake",
    items: [
      {
        q: "How do I swap tokens?",
        a: "Say what you want, for example \"Swap 100 USDT to XPL\". Lyra fetches the live rate and route when you ask, shows them in a ticket, and waits for you to hold the button.",
      },
      {
        q: "How do I move funds to another network?",
        a: "Ask for a bridge, for example \"Bridge 5 XPL to Base\". The ticket shows the quote and the fee before you confirm. A bridge can take a few minutes to arrive.",
      },
      {
        q: "How does staking work?",
        a: "Ask Lyra to stake an amount of a supported token and it is deposited into Aave. There is no lock: you can withdraw whenever you want, with the same hold-to-confirm.",
      },
      {
        q: "Can I ask for several steps at once?",
        a: "Yes, for example \"swap 1,200 XPL to USDT0 and stake it\". Lyra prepares each step as its own ticket, in order, and you confirm each one.",
      },
    ],
  },
  {
    id: "security",
    label: "Security & custody",
    items: [
      {
        q: "Where is my private key?",
        a: "It is encrypted with your password and stored on this device. Lyra can propose transactions but never sees your key. Lyra cannot recover your password for you.",
      },
      {
        q: "What is the recovery phrase?",
        a: "Twelve words that can restore your wallet anywhere. The wallet reminds you to back it up once it holds funds. You can see it any time in Settings, Security, Export your seed phrase (it asks for your password), or ask Lyra. Never share it. A wallet imported from a private key has no phrase.",
      },
      {
        q: "What if I forget my password?",
        a: "Only your recovery phrase can bring the wallet back: reset the wallet in Settings, then import it with the phrase. Without the phrase or the password, nobody can restore it.",
      },
      {
        q: "What is extra protection?",
        a: "An option you can turn on in Settings. Your key is split in two halves, one on your device and one kept by Lyra's server, and neither half can sign alone. It is early access and needs the server to be reachable when you unlock. It is not a multisig.",
      },
      {
        q: "How do I lock the wallet?",
        a: "It locks itself after a period of inactivity: set how long in Settings, General, Auto-lock. You can also tell Lyra \"lock my wallet\". If your device supports it, turn on Biometric unlock in Settings.",
      },
      {
        q: "Can Lyra tell me if an address or a contract is safe?",
        a: "Yes. Lyra reads the same badges an explorer shows: whether a contract's source is verified, trusted-token listings, and scam, phishing or honeypot flags from public security databases. It checks a new recipient by itself before a transfer, and you can ask \"is this address safe?\" or \"is this contract legit?\" at any time. It is a strong signal, not a guarantee: always read the ticket.",
      },
      {
        q: "Can I limit what gets spent?",
        a: "Yes. In Settings you can set a spending limit, and require a biometric confirmation above an amount you choose, on top of the hold-to-confirm.",
      },
    ],
  },
  {
    id: "ui",
    label: "2D & 3D",
    items: [
      {
        q: "What is the difference between 2D and 3D?",
        a: "Same wallet and same Lyra. 2D is the flat screen with the Menu button and the chart. In 3D the wallet floats and tilts with your mouse, and the menu, the chart and your assets move to the sides and the top of the screen.",
      },
      {
        q: "How do I switch?",
        a: "In Settings, General, Interface, or just tell Lyra \"switch to 3D\" or \"switch to 2D\". Your choice is remembered on this device.",
      },
      {
        q: "How do the 3D menus work?",
        a: "Move the mouse to the left or right edge for your menus, and to the top edge for all your assets. On a phone, turn on Tilt Mode and tilt the phone instead.",
      },
      {
        q: "Tilt Mode does not work on my phone",
        a: "It needs a secure (HTTPS) connection and your permission to use the motion sensor. Motion is always optional: Stay in 2D works the same, and nothing in the wallet needs the sensor.",
      },
    ],
  },
];
