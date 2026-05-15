export type SiteIpAllowlistEntry = {
    label: string;
    ip: string;
};

export type SiteIpAllowlistStored = {
    enabled: boolean;
    entries: SiteIpAllowlistEntry[];
};
