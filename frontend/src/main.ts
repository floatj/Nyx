import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { settingsStore } from './stores/settingsStore'

console.log('[Main] Initializing app...');

// Initialize settings before mounting to prevent flash of wrong theme
console.log('[Main] Calling settingsStore.init()...');
settingsStore.init()
console.log('[Main] settingsStore.init() complete');

console.log('[Main] Mounting app...');
const app = mount(App, {
  target: document.getElementById('app')!,
})
console.log('[Main] App mounted');

export default app
