export const createLatestRequestGuard = () => {
  let sequence = 0;
  return {
    begin() {
      sequence += 1;
      return sequence;
    },
    isCurrent(requestId) {
      return requestId === sequence;
    },
  };
};
