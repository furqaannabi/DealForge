import { ProposalStatus } from '../../generated/prisma/client';
import { db } from '../db/client';
import { createSubDelegation } from './delegation';
import type { CaveatParams } from '../types';

const DEFAULT_CAVEAT_PARAMS: CaveatParams = {
  max_amount_wei: '0',
  expiry: 0,
  requires_ipfs_result: true,
  requires_verifier_approval: true,
};

export async function syncAcceptedProposalDelegation(jobId: string, dealId: string) {
  const [job, acceptedProposal] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
    }) as Promise<({ delegationJson?: unknown } | null)>,
    db.proposal.findFirst({
      where: {
        jobId,
        status: ProposalStatus.accepted,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        workerAddress: true,
      },
    }),
  ]);

  const parentDelegation = job?.delegationJson;
  if (!parentDelegation || !acceptedProposal) {
    return null;
  }

  const subDelegation = await createSubDelegation({
    parentDelegation: parentDelegation as Parameters<typeof createSubDelegation>[0]['parentDelegation'],
    workerAddress: acceptedProposal.workerAddress,
    dealId,
    caveatParams: DEFAULT_CAVEAT_PARAMS,
  });

  await db.proposal.update({
    where: { id: acceptedProposal.id },
    data: { subDelegationJson: subDelegation } as never,
  });

  return {
    proposalId: acceptedProposal.id,
    subDelegation,
  };
}
