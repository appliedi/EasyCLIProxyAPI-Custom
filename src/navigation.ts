const alwaysAvailablePages = new Set(['easy', 'home', 'versions', 'config', 'usage-records', 'subscription-value', 'agents']);

export function isAlwaysAvailablePage(pageId: string) {
  return alwaysAvailablePages.has(pageId);
}

export function canOpenAppPage(pageId: string, coreReady: boolean) {
  return coreReady || isAlwaysAvailablePage(pageId);
}
