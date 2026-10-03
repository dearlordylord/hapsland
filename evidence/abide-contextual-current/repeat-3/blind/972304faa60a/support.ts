export interface Session { grant: Grant; }
export interface Grant { capabilities: AccessProfile; }
export interface AccessProfile { access: "read" | "write"; tenant: "north" | "south"; }
