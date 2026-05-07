import type {
  Company, Profile, Client, Service, Crew, CrewMember,
  Job, JobLineItem, ActivityLog
} from '@/types';

export type { Company, Profile, Client, Service, Crew, CrewMember, Job, JobLineItem, ActivityLog };

export type Tables = {
  companies: Company;
  profiles: Profile;
  clients: Client;
  services: Service;
  crews: Crew;
  crew_members: CrewMember;
  jobs: Job;
  job_line_items: JobLineItem;
  activity_log: ActivityLog;
};
