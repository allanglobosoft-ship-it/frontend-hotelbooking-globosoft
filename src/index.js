import './utils/silenceConsoleInProduction'; // first, before any module logs
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/custom.scss'; // compiles full Bootstrap from SCSS with the brand red $primary
import './styles/modernTheme.css'; // global modern-premium polish (layout/spacing/shadows/motion only)
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Includes Popper.js for Tabs
import App from './App';
import { FeatureFlagsProvider } from './config/FeatureFlagsContext';
import { initActivityLogger } from './utils/clientActivityLogger';
import { startGeoTracking } from './utils/geoLocation';
import { purgeLegacyRestaurantExtranetStorage } from './utils/authSession';

// User interactions (navigation, clicks, menus, tabs, dropdowns, form
// submissions + outcome) → backend interaction log; JS errors and failed API
// calls → backend frontend.log. Observe-only; see utils/clientActivityLogger.js.
initActivityLogger();

// Restaurant-extranet tokens now live in sessionStorage; remove any copy an
// older build left in localStorage (readable by every tab and script).
purgeLegacyRestaurantExtranetStorage();

// Browser position (asked once) → X-Client-Location header on API calls, so
// Super Admin → Activity Logs shows where each action was done. Started on
// the login page too, so the login itself carries a location.
startGeoTracking();

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <BrowserRouter>
    <FeatureFlagsProvider>
      <App />
    </FeatureFlagsProvider>
   </BrowserRouter>
);
