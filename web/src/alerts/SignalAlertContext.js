import { createContext, useContext } from 'react';

export const SignalAlertContext = createContext({
  browserEnabled: false,
  toggleBrowser: () => {},
  ensureSubscribed: async () => 'error',
  permission: 'default',
});

export const useSignalAlerts = () => useContext(SignalAlertContext);
