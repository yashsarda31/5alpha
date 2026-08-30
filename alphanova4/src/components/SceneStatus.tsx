export interface SceneStatusValue {
  message: string;
  tone?: 'neutral' | 'warning';
}

export const SceneStatus = ({ value }: { value?: SceneStatusValue | null }) => (
  value ? <div className={`scene-status ${value.tone === 'warning' ? 'is-warning' : ''}`} role="status">{value.message}</div> : null
);
