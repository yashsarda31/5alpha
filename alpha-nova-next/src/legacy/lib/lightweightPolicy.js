const PREDICTION_ROUTES = new Set(['/dashboard', '/leaderboard', '/trading-game']);

export const shouldLoadPrediction = (pathname) => PREDICTION_ROUTES.has(pathname);
