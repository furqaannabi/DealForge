import { IPFS_GATEWAY } from '@/lib/config';

type IpfsTaskPayload = {
  metadata?: {
    title?: string;
    category?: string;
    poster_address?: string;
  };
  description?: string;
  format?: string;
  task?: string | {
    title?: string;
    description?: string;
  };
};

export type IpfsTaskDetails = {
  title: string | null;
  description: string | null;
  category: string | null;
  posterAddress: string | null;
  format: string | null;
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

function extractDescription(task: IpfsTaskPayload['task'], description?: string) {
  if (typeof task === 'string') {
    return task;
  }

  if (task?.description) {
    return task.description;
  }

  return description ?? null;
}

export async function fetchIpfsTaskDetails(cid: string): Promise<IpfsTaskDetails> {
  const response = await fetch(`${IPFS_GATEWAY}/${cid}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`IPFS fetch failed for ${cid}`);
  }

  const raw = await response.text();

  try {
    const payload = JSON.parse(raw) as IpfsTaskPayload;
    return {
      title:
        payload.metadata?.title ??
        (typeof payload.task === 'object' ? payload.task?.title ?? null : null) ??
        extractTitleFromText(payload.description ?? '') ??
        extractTitleFromText(typeof payload.task === 'string' ? payload.task : ''),
      description: extractDescription(payload.task, payload.description),
      category: payload.metadata?.category ?? null,
      posterAddress: payload.metadata?.poster_address ?? null,
      format: payload.format ?? null,
    };
  } catch {
    return {
      title: extractTitleFromText(raw),
      description: raw.trim() || null,
      category: null,
      posterAddress: null,
      format: 'text/plain',
    };
  }
}

export async function fetchIpfsTaskTitle(cid: string) {
  const details = await fetchIpfsTaskDetails(cid);
  return details.title;
}

export async function fetchIpfsContent(cid: string) {
  const response = await fetch(`${IPFS_GATEWAY}/${cid}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`IPFS fetch failed for ${cid}`);
  }

  const raw = await response.text();

  try {
    const payload = JSON.parse(raw) as unknown;
    return {
      raw,
      formatted: JSON.stringify(payload, null, 2),
      isJson: true,
    };
  } catch {
    return {
      raw,
      formatted: raw,
      isJson: false,
    };
  }
}
