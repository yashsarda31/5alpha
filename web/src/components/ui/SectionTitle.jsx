import React from 'react';

// Uppercase ice-blue section label that divides a page into blocks.
const SectionTitle = ({ icon, children }) => (
  <div className="ui-section-title">
    {icon && <span aria-hidden="true">{icon}</span>}
    {children}
  </div>
);

export default SectionTitle;
