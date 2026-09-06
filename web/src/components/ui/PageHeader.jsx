import React from 'react';

// Shared title and supporting context, with an optional action/status slot.
const PageHeader = ({ title, subtitle, right }) => (
  <div className="ui-page-header">
    <div>
      <div className="ui-ph-titlerow">
        <h1 className="ui-ph-title">{title}</h1>
      </div>
      {subtitle && <div className="ui-ph-subtitle">{subtitle}</div>}
    </div>
    {right && <div className="ui-ph-right">{right}</div>}
  </div>
);

export default PageHeader;
