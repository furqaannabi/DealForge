import { IPFS_GATEWAY } from '@/lib/config';

type IpfsTaskPayload = {
  metadata?: {
    title?: string;
  };
  description?: string;
  task?: {
    title?: string;
  };
};

function extractTitleFromText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const markdownHeading = trimmed.match(/^#\s+(.+)$/m);
  if (markdownHeading?.[1]) {
    return markdownHeading[1].trim();
  }

  const firstMeaningfulLine = trimmed
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMeaningfulLine ?? null;
}

export async function fetchIpfsTaskTitle(cid: string) {
  const response = await fetch(`${IPFS_GATEWAY}/${cid}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`IPFS fetch failed for ${cid}`);
  }

  const raw = await response.text();

  try {
    const payload = JSON.parse(raw) as IpfsTaskPayload;
    console.log(payload)
    return payload.metadata?.title ?? payload.task?.title ?? extractTitleFromText(payload.description ?? '') ?? null;
  } catch {
    return extractTitleFromText(raw);
  }
}
