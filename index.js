import fs from 'fs/promises';
import axios from "axios";
import { Wallet } from "ethers";

const logger = {
    verbose: true,
    _formatTimestamp() {
        return `[${new Date().toLocaleTimeString()}]`;
    },
    _getLevelPrefix(level) {
        const prefixes = {
            info: "[INFO]",
            warn: "[WARN]",
            error: "[ERROR]",
            success: "[SUCCESS]",
            debug: "[DEBUG]",
            verbose: "[VERBOSE]"
        };
        return prefixes[level] || "[UNKNOWN]";
    },
    _formatError(error) {
        if (!error) return '';
        let errorDetails = '';
        if (axios.isAxiosError(error)) {
            errorDetails = `
Status: ${error.response?.status || 'N/A'}
Status Text: ${error.response?.statusText || 'N/A'}
URL: ${error.config?.url || 'N/A'}
Method: ${error.config?.method?.toUpperCase() || 'N/A'}
Response Data: ${JSON.stringify(error.response?.data || {}, null, 2)}
Headers: ${JSON.stringify(error.config?.headers || {}, null, 2)}`;
        }
        return `${error.message}${errorDetails}`;
    },
    log(level, message, value = '', error = null) {
        const timestamp = this._formatTimestamp();
        const levelPrefix = this._getLevelPrefix(level);
        let formattedMessage = `◆ LayerEdge Auto Bot ${timestamp} ${levelPrefix} ${message}`;
        if (value) {
            const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            formattedMessage += ` ${formattedValue}`;
        }
        if (error && this.verbose) {
            formattedMessage += `
${this._formatError(error)}`;
        }
        console.log(formattedMessage);
    },
    info: (message, value = '') => logger.log('info', message, value),
    warn: (message, value = '') => logger.log('warn', message, value),
    error: (message, value = '', error = null) => logger.log('error', message, value, error),
    success: (message, value = '') => logger.log('success', message, value),
    debug: (message, value = '') => logger.log('debug', message, value),
    verbose: (message, value = '') => logger.verbose && logger.log('verbose', message, value),
    progress(wallet, step, status) {
        const progressSymbol = status === 'success' 
            ? '✔' 
            : status === 'failed' 
            ? '✘' 
            : '➤';
        console.log(
            `◆ LayerEdge Auto Bot ${this._formatTimestamp()} [PROGRESS]`,
            `${progressSymbol} ${wallet} - ${step}`
        );
    }
};

class RequestHandler {
    static async makeRequest(config, retries = 30, backoffMs = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                logger.verbose(`Attempting request (${i + 1}/${retries})`, `URL: ${config.url}`);
                const response = await axios(config);
                logger.verbose(`Request successful`, `Status: ${response.status}`);
                return response;
            } catch (error) {
                const isLastRetry = i === retries - 1;
                const status = error.response?.status;
                if (status === 500) {
                    logger.error(`Server Error (500)`, `Attempt ${i + 1}/${retries}`, error);
                    if (isLastRetry) break;
                    const waitTime = backoffMs * Math.pow(1.5, i);
                    logger.warn(`Waiting ${waitTime / 1000}s before retry...`);
                    await delay(waitTime / 1000);
                    continue;
                }
                if (isLastRetry) {
                    logger.error(`Max retries reached`, '', error);
                    return null;
                }
                logger.warn(`Request failed`, `Attempt ${i + 1}/${retries}`, error);
                await delay(2);
            }
        }
        return null;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * 1000));
}

async function saveToFile(filename, data) {
    try {
        await fs.appendFile(filename, `${data}\n`, 'utf-8');
        logger.info(`Data saved to ${filename}`);
    } catch (error) {
        logger.error(`Failed to save data to ${filename}: ${error.message}`);
    }
}

async function readFile(pathFile) {
    try {
        const datas = await fs.readFile(pathFile, 'utf8');
        return datas.split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
    } catch (error) {
        logger.error(`Error reading file: ${error.message}`);
        return [];
    }
}

class LayerEdgeConnection {
    constructor(privateKey = null, refCode = "knYyWnsE") {
        this.refCode = refCode;
        this.retryCount = 30;
        this.headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://layeredge.io',
            'Referer': 'https://layeredge.io/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        };
        this.axiosConfig = {
            timeout: 60000,
            headers: this.headers,
            validateStatus: (status) => status < 500
        };
        this.wallet = privateKey
            ? new Wallet(privateKey)
            : Wallet.createRandom();
        logger.verbose(`Initialized LayerEdgeConnection`, 
            `Wallet: ${this.wallet.address}`);
    }

    async makeRequest(method, url, config = {}) {
        const finalConfig = {
            method,
            url,
            ...this.axiosConfig,
            ...config,
            headers: {
                ...this.headers,
                ...(config.headers || {})
            }
        };
        return await RequestHandler.makeRequest(finalConfig, this.retryCount);
    }

    async checkInvite() {
        const inviteData = {
            invite_code: this.refCode,
        };
        const response = await this.makeRequest(
            "post",
            "https://referralapi.layeredge.io/api/referral/verify-referral-code",
            { data: inviteData }
        );
        if (response && response.data && response.data.data.valid === true) {
            logger.info("Invite Code Valid", response.data);
            return true;
        } else {
            logger.error("Failed to check invite");
            return false;
        }
    }

    async registerWallet() {
        const registerData = {
            walletAddress: this.wallet.address,
        };
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/referral/register-wallet/${this.refCode}`,
            { data: registerData }
        );
        if (response && response.data) {
            logger.info("Wallet successfully registered", response.data);
            return true;
        } else {
            logger.error("Failed To Register wallets", "error");
            return false;
        }
    }

    async connectNode() {
        const timestamp = Date.now();
        const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
        const sign = await this.wallet.signMessage(message);
        const dataSign = {
            sign: sign,
            timestamp: timestamp,
        };
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/start`,
            { data: dataSign }
        );
        if (response && response.data && response.data.message === "node action executed successfully") {
            logger.info("Connected Node Successfully", response.data);
            return true;
        } else {
            logger.info("Failed to connect Node");
            return false;
        }
    }

    async stopNode() {
        const timestamp = Date.now();
        const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
        const sign = await this.wallet.signMessage(message);
        const dataSign = {
            sign: sign,
            timestamp: timestamp,
        };
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/stop`,
            { data: dataSign }
        );
        if (response && response.data) {
            logger.info("Stop and Claim Points Result:", response.data);
            return true;
        } else {
            logger.error("Failed to Stopping Node and claiming points");
            return false;
        }
    }

    async dailyCheckIn() {
        try {
            const timestamp = Date.now();
            const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
            const sign = await this.wallet.signMessage(message);
            const dataSign = { sign, timestamp, walletAddress: this.wallet.address };
            const response = await this.makeRequest(
                "post",
                "https://referralapi.layeredge.io/api/light-node/claim-node-points",
                { data: dataSign }
            );
            if (response && response.data) {
                if (response.data.statusCode && response.data.statusCode === 405) {
                    const cooldownMatch = response.data.message.match(/after\s+([^!]+)!/);
                    const cooldownTime = cooldownMatch ? cooldownMatch[1].trim() : "unknown time";
                    logger.info("⚠️ Daily Check-in Already Completed", `Come back after ${cooldownTime}`);
                    return true;
                } else {
                    logger.info("✅ Daily Check-in Successful", response.data);
                    return true;
                }
            } else {
                logger.error("❌ Daily Check-in Failed");
                return false;
            }
        } catch (error) {
            logger.error("Error during daily check-in:", error);
            return false;
        }
    }

    async checkNodeStatus() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/light-node/node-status/${this.wallet.address}`
        );
        if (response && response.data && response.data.data.startTimestamp !== null) {
            logger.info("Node Status Running", response.data);
            return true;
        } else {
            logger.error("Node not running trying to start node...");
            return false;
        }
    }

    async checkNodePoints() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info(`${this.wallet.address} Total Points:`, response.data.data?.nodePoints || 0);
            return true;
        } else {
            logger.error("Failed to check Total Points..");
            return false;
        }
    }

    async claimLightNodePoints() {
        try {
            const timestamp = Date.now();
            const message = `I am claiming my light node run task node points for ${this.wallet.address} at ${timestamp}`;
            const sign = await this.wallet.signMessage(message);
            const claimData = {
                walletAddress: this.wallet.address,
                timestamp: timestamp,
                sign: sign
            };
            const response = await this.makeRequest(
                "post",
                "https://referralapi.layeredge.io/api/task/node-points",
                { data: claimData }
            );
            if (response && response.data && response.data.message === "node points task completed successfully") {
                logger.success("Light node points claimed successfully");
                return true;
            } else {
                logger.error("Failed to claim light node points", response?.data);
                return false;
            }
        } catch (error) {
            logger.error("Error claiming light node points", "", error);
            return false;
        }
    }
}

// Main Application
async function readWallets() {
    try {
        await fs.access("wallets.json");
        const data = await fs.readFile("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

async function run() {
    logger.info('Starting Layer Edge Auto Bot', 'Initializing...');
    try {
        let wallets = await readWallets();
        if (wallets.length === 0) {
            throw new Error('No wallets configured');
        }
        logger.info('Configuration loaded', `Wallets: ${wallets.length}`);
        while (true) {
            for (let i = 0; i < wallets.length; i++) {
                const wallet = wallets[i];
                const { address, privateKey } = wallet;
                try {
                    logger.verbose(`Processing wallet ${i + 1}/${wallets.length}`, address);
                    const socket = new LayerEdgeConnection(privateKey);
                    logger.progress(address, 'Wallet Processing Started', 'start');
                    logger.info(`Wallet Details`, `Address: ${address}`);
                    logger.progress(address, 'Performing Daily Check-in', 'processing');
                    await socket.dailyCheckIn();
                    logger.progress(address, 'Checking Node Status', 'processing');
                    const isRunning = await socket.checkNodeStatus();
                    if (isRunning) {
                        logger.progress(address, 'Claiming Node Points', 'processing');
                        await socket.stopNode();
                    }
                    logger.progress(address, 'Reconnecting Node', 'processing');
                    await socket.connectNode();
                    logger.progress(address, 'Claiming Light Node Points', 'processing');
                    await socket.claimLightNodePoints();
                    logger.progress(address, 'Checking Node Points', 'processing');
                    await socket.checkNodePoints();
                    logger.progress(address, 'Wallet Processing Complete', 'success');
                } catch (error) {
                    logger.error(`Failed processing wallet ${address}`, '', error);
                    logger.progress(address, 'Wallet Processing Failed', 'failed');
                    await delay(5);
                }
            }
            logger.warn('Cycle Complete', 'Waiting 1 hour before next run...');
            await delay(60 * 60);
        }
    } catch (error) {
        logger.error('Fatal error occurred', '', error);
        process.exit(1);
    }
}

run();