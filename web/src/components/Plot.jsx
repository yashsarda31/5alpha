// Shared Plotly component built on the finance-only distribution (~1.4 MB vs
// ~4.6 MB for full plotly.js). Covers every trace type the app uses: scatter,
// bar, pie, ohlc, candlestick, indicator. Import this instead of
// 'react-plotly.js' — the default entry drags the full bundle in.
import createPlotlyComponentCJS from 'react-plotly.js/factory';
import PlotlyCJS from 'plotly.js-finance-dist-min';

// Both packages are CommonJS; depending on the bundler's interop the callable
// lands on .default (same hack the old direct react-plotly.js import needed).
const createPlotlyComponent = createPlotlyComponentCJS.default || createPlotlyComponentCJS;
const Plotly = PlotlyCJS.default || PlotlyCJS;

const Plot = createPlotlyComponent(Plotly);
export default Plot;
