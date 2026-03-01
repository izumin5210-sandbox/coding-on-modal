export type AuthUser = {
  id: string;
  github: {
    id: string;
    login: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
};
