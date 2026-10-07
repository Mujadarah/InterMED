/**
 * InterMED admin runner entrypoint, Milestone 3 stub.
 *
 * The runner deliberately performs no ingestion, validation or publication
 * work. It reads no source material, writes nothing and calls no service: the
 * real runner arrives in Milestone 5 behind this same entrypoint contract and
 * its own approval gates. The function has no public execute permission and
 * carries no variables or credentials.
 */
const stubNotice = {
  status: 'stub-not-implemented',
  plannedMilestone: 5,
  note: 'No source ingestion runs before the Milestone 5 implementation and its approvals.',
};

export default async ({ req, res, log }) => {
  log(`import-anmdmr stub received ${req.method}`);
  return res.json(stubNotice, 501);
};
