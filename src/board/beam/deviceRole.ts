export function defaultBeamTab(formFactor: 'desktop' | 'mobile', hasDocument: boolean, preferredRole?: 'receiver' | 'sender'): 'receive' | 'send' {
  if (preferredRole) return preferredRole === 'receiver' ? 'receive' : 'send';
  return formFactor === 'desktop' && !hasDocument ? 'receive' : 'send';
}
