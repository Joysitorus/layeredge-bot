# Layer Edge Auto Bot without Proxy

## Features

- **Multi-Wallet Support**: Manage multiple wallets simultaneously.
- **Auto-Retry with Detailed Information**: Handle bad request, etc.
- **Auto chech every 1 hour**: Get insights into your node.
- **Cross-Platform Compatibility**: Works on Windows, macOS, and Linux.

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Joysitorus/layeredge-bot
   cd layeredge-bot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a wallets.txt file and add your wallet addresses and private keys:
   ```bash
   [
    {
        "address": "YOUR WALLET ADDRESS",
        "privateKey": "YOUR PRIVATE KEY"
    },
    {
        "address": "YOUR WALLET ADDRESS",
        "privateKey": "YOUR PRIVATE KEY"
    }
   ]
   ```
4. Run Bot
   ```bash
   node index.js
   ```
