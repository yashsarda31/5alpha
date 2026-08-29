import React from 'react';

// Standard page header: mono command chip + title + subtitle, with an
// optional right-side action/status slot. Used at the top of every page.
const PageHeader = ({ code, title, subtitle, right }) => (
  <div className="ui-page-header">
    <div>
      <div className="ui-ph-titlerow">
        {code && <span className="ui-code-chip">{code}</span>}
        <h1 className="ui-ph-title">{title}</h1>
      </div>
      {subtitle && <div className="ui-ph-subtitle">{subtitle}</div>}
    </div>
    {right && <div className="ui-ph-right">{right}</div>}
  </div>
);

export default PageHeader;
