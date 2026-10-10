'use client';

import { useEffect } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

export function UpdaterSetup() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Notify Capgo that the app started successfully.
      // If this isn't called after an update, Capgo will rollback.
      CapacitorUpdater.notifyAppReady().catch(console.error);
    }
  }, []);

  return null;
}
