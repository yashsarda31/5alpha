import React from 'react';

// Uppercase ice-blue section label that divides a page into blocks.
const SectionTitle = ({ icon, children, level = 2, id }) => {
  const Heading = `h${level}`;
  return (
    <Heading className="ui-section-title" id={id}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </Heading>
  );
};

export default SectionTitle;
