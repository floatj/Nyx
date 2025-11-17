import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { settingsStore } from './stores/settingsStore'

// Initialize settings before mounting to prevent flash of wrong theme
settingsStore.init()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
