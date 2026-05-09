import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import type { JobStatus } from '@/types';

export interface TodaysRunJob {
  id: string;
  title: string;
  status: JobStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  client: { id: string; name: string; service_address: string } | null;
  crew: { id: string; name: string; color: string } | null;
}

interface Props {
  jobs: TodaysRunJob[];
}

function fmtTime(t: string | null) {
  if (!t) return '—';
  return t.slice(0, 5);
}

export function TodaysRunTable({ jobs }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b">
        <div>
          <h2
            className="text-base uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
          >
            Today&apos;s run
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live status across all crews
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-block h-2 w-2 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Live · auto-refresh on
          </span>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12 px-5">
          Nothing scheduled today. Click <strong>+ New Job</strong> to add one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-5 py-2.5">Job</th>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Crew</th>
                <th className="px-3 py-2.5">Window</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="hover:bg-muted/40 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {job.client ? (
                      <>
                        <Link
                          href={`/dashboard/clients/${job.client.id}`}
                          className="hover:underline"
                        >
                          {job.client.name}
                        </Link>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {job.client.service_address?.split(',')[0]}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {job.crew ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: job.crew.color }}
                          title={`Crew color: ${job.crew.color}`}
                        />
                        <span>{job.crew.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground tabular-nums">
                    {fmtTime(job.scheduled_start)}–{fmtTime(job.scheduled_end)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={job.status} type="job" />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <Link href={`/dashboard/jobs/${job.id}`} aria-label="Open job">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
