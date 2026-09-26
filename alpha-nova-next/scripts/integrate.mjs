import { readFileSync, writeFileSync } from 'node:fs';
const appPath = new URL('../src/App.tsx', import.meta.url);
let app = readFileSync(appPath, 'utf8');
app = app.replace("const Momentum = specialist['/momentum'];", "const Momentum = specialist['/momentum'] as React.ComponentType<Record<string, unknown>>;\nconst OptionChain = specialist['/option-chain'];\nconst DeliveryRadar = specialist['/delivery-radar'];");
app = app.replaceAll('const { market, setMarket } = useMarket();', 'const { market, setMarket } = useMarket() as {market: string; setMarket: (market: string) => void};');
app = app.replace('const location = useLocation();', 'const location = useLocation();\n  const navigate = useNavigate();');
app = app.replace("inputProps={{ autoFocus: true, 'aria-label': 'Search stocks' }}", "inputStyle={undefined} inputProps={{ autoFocus: true, 'aria-label': 'Search stocks' }}");
app = app.replace("const setSelectedMarket = (next: string) => { setMarket(next); if (new URLSearchParams(location.search).has('market')) window.history.replaceState(null, '', location.pathname); };", "const setSelectedMarket = (next: string) => { setMarket(next); const params = new URLSearchParams(location.search); params.set('market', next); if (location.pathname === '/chart') params.delete('symbol'); navigate({ pathname: location.pathname, search: params.toString() }, { replace: true }); };");
const aliases = [['high-delivery-volume-stocks-today','delivery-radar'], ['fii-dii-data-today','fiidii'], ['bulk-block-deals-today','deals']].map(([path,target]) => `<Route path="/${path}" element={<Navigate to="/${target}" replace/>}/>`).join('');
app = app.replace('<Route path="*" element={<EmptyState', `${aliases}<Route path="/nifty-pcr-today" element={<div className="an-legacy"><OptionChain defaultSymbol="NIFTY"/></div>}/><Route path="/bank-nifty-oi-analysis" element={<div className="an-legacy"><OptionChain defaultSymbol="BANKNIFTY"/></div>}/><Route path="/stocks/:symbol/delivery-percentage" element={<div className="an-legacy"><DeliveryRadar/></div>}/><Route path="*" element={<EmptyState`);
writeFileSync(appPath, app);
writeFileSync(new URL('../eslint.config.js',import.meta.url), `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
 { ignores: ['dist/**','node_modules/**','src/legacy/**','scripts/**','public/**','tests/**','**/*.test.*'] },
 js.configs.recommended, ...tseslint.configs.recommended,
 { files: ['src/**/*.{ts,tsx,js}'], languageOptions:{globals:globals.browser}, plugins:{'react-hooks':hooks}, rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]} },
 { files: ['*.js','*.ts'], languageOptions:{globals:globals.node} },
);\n`);
