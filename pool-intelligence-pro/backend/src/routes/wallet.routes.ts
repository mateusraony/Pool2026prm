/**
 * Wallet Tracking Routes — ETAPA 17
 */

import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { walletService } from '../services/wallet.service.js';
import { z } from 'zod';

const router = Router();

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const walletSchema = z.object({
  address: z.string().regex(ETH_ADDRESS_REGEX, 'Invalid Ethereum address'),
  label: z.string().max(50).optional(),
});

// GET /api/wallet/:address/positions — Posições de uma wallet
router.get('/wallet/:address/positions', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ETH_ADDRESS_REGEX.test(address)) {
      return res.status(400).json({ success: false, error: 'Invalid Ethereum address', timestamp: new Date() });
    }
    const positions = await walletService.getWalletPositions(address);
    res.json({ success: true, data: positions, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /wallet/:address/positions failed', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch wallet positions', timestamp: new Date() });
  }
});

// GET /api/wallets — Lista wallets monitoradas
router.get('/wallets', (_req, res) => {
  try {
    res.json({ success: true, data: walletService.getTrackedWallets(), timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal error', timestamp: new Date() });
  }
});

// POST /api/wallets — Adiciona wallet à lista
router.post('/wallets', async (req, res) => {
  try {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid wallet data', details: parsed.error.flatten(), timestamp: new Date() });
    }
    const wallet = walletService.addWallet(parsed.data.address, parsed.data.label);
    res.json({ success: true, data: wallet, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /wallets failed', { error });
    res.status(500).json({ success: false, error: 'Failed to add wallet', timestamp: new Date() });
  }
});

// DELETE /api/wallets/:address — Remove wallet da lista
router.delete('/wallets/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ETH_ADDRESS_REGEX.test(address)) {
      return res.status(400).json({ success: false, error: 'Invalid Ethereum address', timestamp: new Date() });
    }
    const removed = walletService.removeWallet(address);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Wallet not found', timestamp: new Date() });
    }
    res.json({ success: true, message: 'Wallet removed', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /wallets/:address failed', { error });
    res.status(500).json({ success: false, error: 'Failed to remove wallet', timestamp: new Date() });
  }
});

export default router;
