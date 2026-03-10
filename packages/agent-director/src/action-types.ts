export interface CreateEpicAction {
  action: 'create_epic';
  title: string;
  description: string;
  tasks: Array<{
    id: string;
    title: string;
    agent: string;
    description: string;
    dependencies: string[];
  }>;
}

export interface StatusQueryAction {
  action: 'status_query';
  query: string;
}

export interface ClarifyAction {
  action: 'clarify';
  message: string;
}

export type DirectorAction = CreateEpicAction | StatusQueryAction | ClarifyAction;
