import { WahaConfig } from '../types';

const WAHA_CONFIG_KEY = 'escher_waha_config';

const DEFAULT_CONFIG: WahaConfig = {
    apiUrl: 'https://waha.royyaninezfamily.my.id',
    apiKey: '',
    session: 'default',
    allowedIds: ''
};

export const getWahaConfig = (): WahaConfig => {
    const stored = localStorage.getItem(WAHA_CONFIG_KEY);
    if (!stored) return DEFAULT_CONFIG;
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    } catch (e) {
        console.error("Failed to parse WAHA config", e);
        return DEFAULT_CONFIG;
    }
};

export const saveWahaConfig = (config: WahaConfig): void => {
    localStorage.setItem(WAHA_CONFIG_KEY, JSON.stringify(config));
};

export const sendWahaMessage = async (config: WahaConfig, to: string, text: string) => {
    if (!config.apiUrl) return;

    const url = `${config.apiUrl}/api/sendText`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': config.apiKey
            },
            body: JSON.stringify({
                chatId: to,
                text: text,
                session: config.session
            })
        });

        if (!response.ok) {
            console.error("WAHA Send Error:", await response.text());
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to send WAHA message:", error);
    }
};
