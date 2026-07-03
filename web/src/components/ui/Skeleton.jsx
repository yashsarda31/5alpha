import React from 'react';

// Shimmer loading placeholder. `rows` renders a stack of bars; a single
// bar otherwise. Height/width are overridable via style.
const Skeleton = ({ rows = 1, height = 20, style }) => {
  if (rows <= 1) {
    return <div className="ui-skel" style={{ height, ...style }} />;
  }
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ui-skel" style={{ height, marginTop: i ? 12 : 0, ...style }} />
      ))}
    </div>
  );
};

export default Skeleton;
