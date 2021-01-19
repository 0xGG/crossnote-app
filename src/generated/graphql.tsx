import gql from "graphql-tag";
import * as React from "react";
import * as Urql from "urql";
export type Maybe<T> = T | null;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
/** All built-in and custom scalars, mapped to their actual values */
export interface Scalars {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  Time: any;
  UUID: any;
  Upload: any;
}

export interface NotificationEventCommentWidgetMessagePosting
  extends NotificationEvent {
  __typename?: "NotificationEventCommentWidgetMessagePosting";
  type: NotificationEventType;
  message: CommentWidgetMessage;
}

export interface LinkWithGitHubAccount {
  code: Scalars["String"];
}

export interface GitHubUser {
  __typename?: "GitHubUser";
  login: Scalars["String"];
  avatar: Scalars["String"];
  email: Scalars["String"];
}

export interface WidgetInstance {
  type: WidgetType;
}

export interface AuthReturn {
  __typename?: "AuthReturn";
  /** JSON Web Token */
  token: Scalars["String"];
  /** User */
  user: User;
}

export interface SendEmailVerificationCode {
  email: Scalars["String"];
}

export interface UnsubscribeFromCommentWidget {
  widgetID: Scalars["UUID"];
}

export interface NotificationEvent {
  type: NotificationEventType;
}

export interface Widget {
  __typename?: "Widget";
  id: Scalars["UUID"];
  instance: WidgetInstance;
  owner: User;
  description: Scalars["String"];
  source: Scalars["String"];
  canConfigure: Scalars["Boolean"];
}

export interface NotificationConnection {
  __typename?: "NotificationConnection";
  totalCount: Scalars["Int"];
  pageInfo: PageInfo;
  edges: Array<NotificationEdge>;
}

export interface ResetPassword {
  email: Scalars["String"];
  verificationCode: Scalars["String"];
  password: Scalars["String"];
}

export interface UpdateCommentWidgetMessage {
  messageID: Scalars["UUID"];
  markdown: Scalars["String"];
}

export interface StarNotebook {
  notebookID: Scalars["UUID"];
}

export enum NotificationEventType {
  UserFollowing = "USER_FOLLOWING",
  CommentWidgetMessagePosting = "COMMENT_WIDGET_MESSAGE_POSTING",
}

export interface UserWidget {
  __typename?: "UserWidget";
  type: WidgetType;
  count: Scalars["Int"];
}

export interface SignUpWithGitHubAccount {
  username: Scalars["String"];
  email: Scalars["String"];
  accessToken: Scalars["String"];
}

export interface Query {
  __typename?: "Query";
  test: Scalars["String"];
  widget: Widget;
  notebooks: Array<Notebook>;
  viewer: User;
  user: User;
  stats: Stats;
}

export interface QueryWidgetArgs {
  id: Scalars["UUID"];
}

export interface QueryNotebooksArgs {
  orderBy?: Maybe<NotebookOrderBy>;
  query?: Maybe<Scalars["String"]>;
  page?: Maybe<Scalars["Int"]>;
  perPage?: Maybe<Scalars["Int"]>;
}

export interface QueryUserArgs {
  id?: Maybe<Scalars["UUID"]>;
  username?: Maybe<Scalars["String"]>;
}

export enum WidgetType {
  Comment = "COMMENT",
}

export interface PublishNotebook {
  gitURL: Scalars["String"];
  gitBranch: Scalars["String"];
}

export interface PageInfo {
  __typename?: "PageInfo";
  startCursor: Scalars["UUID"];
  endCursor: Scalars["UUID"];
  hasPreviousPage: Scalars["Boolean"];
  hasNextPage: Scalars["Boolean"];
}

export interface WidgetConnection {
  __typename?: "WidgetConnection";
  /** Identifies the total count of items in the connection. */
  totalCount: Scalars["Int"];
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** A list of edges. */
  edges: Array<WidgetEdge>;
}

export interface CommentWidgetMessageReaction {
  __typename?: "CommentWidgetMessageReaction";
  message: CommentWidgetMessage;
  user: User;
  reaction: Scalars["String"];
}

export interface CommentWidgetMessage {
  __typename?: "CommentWidgetMessage";
  /** Comment message ID */
  id: Scalars["UUID"];
  /** The comment widget that this comment belongs to */
  widget: Widget;
  /** Author of this comment message */
  author: User;
  /** Comment message (markdown content) */
  markdown: Scalars["String"];
  /** Created At */
  createdAt: Scalars["Time"];
  /** updatedAt at */
  updatedAt: Scalars["Time"];
  /** Reaction summaries */
  reactionSummaries: Array<ReactionSummary>;
}

export interface CommentWidgetMessageReactionSummariesArgs {
  size?: Maybe<Scalars["Int"]>;
}

export interface Notification {
  __typename?: "Notification";
  id: Scalars["UUID"];
  createdAt: Scalars["Time"];
  event: NotificationEvent;
  meta: Scalars["String"];
  receiver: User;
  origin: User;
}

export interface SetUserInfo {
  name: Scalars["String"];
  avatar: Scalars["String"];
  cover: Scalars["String"];
  bio: Scalars["String"];
  location: Scalars["String"];
  language: Scalars["String"];
  editorCursorColor: Scalars["String"];
}

export interface FollowUser {
  userID: Scalars["UUID"];
}

export interface SignInWithGitHubAccount {
  code: Scalars["String"];
}

export interface UpdateNotebook {
  notebookID: Scalars["UUID"];
  gitURL: Scalars["String"];
  gitBranch: Scalars["String"];
}

export interface NotificationEventUserFollowing extends NotificationEvent {
  __typename?: "NotificationEventUserFollowing";
  type: NotificationEventType;
}

export interface NotificationEdge {
  __typename?: "NotificationEdge";
  cursor: Scalars["UUID"];
  node: Notification;
}

export interface Stats {
  __typename?: "Stats";
  numUsers: Scalars["Int"];
  numNotebooks: Scalars["Int"];
}

export enum NotebookOrderBy {
  TotalStarsCount = "TOTAL_STARS_COUNT",
  DailyStarsCount = "DAILY_STARS_COUNT",
  WeeklyStarsCount = "WEEKLY_STARS_COUNT",
  MonthlyStarsCount = "MONTHLY_STARS_COUNT",
}

export interface CommentWidgetMessageEdge {
  __typename?: "CommentWidgetMessageEdge";
  /** A cursor for use in pagination. */
  cursor: Scalars["UUID"];
  /** The item at the end of the edge. */
  node: CommentWidgetMessage;
}

export interface CommentWidgetMessageConnection {
  __typename?: "CommentWidgetMessageConnection";
  /** Identifies the total count of items in the connection. */
  totalCount: Scalars["Int"];
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** A list of edges. */
  edges: Array<CommentWidgetMessageEdge>;
}

export interface AddReactionToCommentWidget {
  widgetID: Scalars["UUID"];
  reaction: Scalars["String"];
}

export interface NotebookConnection {
  __typename?: "NotebookConnection";
  totalCount: Scalars["Int"];
  pageInfo: PageInfo;
  edges: Array<NotebookEdge>;
}

export interface DeleteNotification {
  notificationID: Scalars["UUID"];
}

export interface ReactionSummary {
  __typename?: "ReactionSummary";
  count: Scalars["Int"];
  reaction: Scalars["String"];
  selfAuthored: Scalars["Boolean"];
}

export interface CommentWidget {
  __typename?: "CommentWidget";
  /** Widget ID */
  id: Scalars["UUID"];
  /** Widget creation time */
  createdAt: Scalars["Time"];
  /** Widget update time */
  updatedAt: Scalars["Time"];
  /** Count of messages in this comment widget */
  messagesCount: Scalars["Int"];
  /** Count of reactions in this comment widget */
  reactionsCount: Scalars["Int"];
  /** Check if the viewer subscribed to the comment widget */
  subscribed: Scalars["Boolean"];
  /** Comment messages */
  messages: CommentWidgetMessageConnection;
  /** Reaction summaries */
  reactionSummaries: Array<ReactionSummary>;
}

export interface CommentWidgetMessagesArgs {
  before?: Maybe<Scalars["UUID"]>;
  after?: Maybe<Scalars["UUID"]>;
  first?: Maybe<Scalars["Int"]>;
  last?: Maybe<Scalars["Int"]>;
}

export interface CommentWidgetReactionSummariesArgs {
  size?: Maybe<Scalars["Int"]>;
}

export interface SignInInput {
  /** Email */
  email: Scalars["String"];
  /** Password */
  password: Scalars["String"];
}

export interface PostCommentWidgetMessage {
  widgetID: Scalars["UUID"];
  markdown: Scalars["String"];
  notifyUsers: Array<Maybe<Scalars["String"]>>;
}

export interface NotebookEdge {
  __typename?: "NotebookEdge";
  cursor: Scalars["UUID"];
  node: Notebook;
}

export interface UpdateWidget {
  id: Scalars["UUID"];
  description: Scalars["String"];
  source: Scalars["String"];
}

export interface SignUpInput {
  /** Username */
  username: Scalars["String"];
  /** Email */
  email: Scalars["String"];
  /** Password */
  password: Scalars["String"];
}

export interface RemoveReactionFromCommentWidgetMessage {
  messageID: Scalars["UUID"];
  reaction: Scalars["String"];
}

export interface UnpublishNotebook {
  notebookID: Scalars["UUID"];
}

export interface CommentWidgetInstance extends WidgetInstance {
  __typename?: "CommentWidgetInstance";
  type: WidgetType;
  commentWidget: CommentWidget;
}

export interface WidgetEdge {
  __typename?: "WidgetEdge";
  /** A cursor for use in pagination. */
  cursor: Scalars["UUID"];
  /** The item at the end of the edge. */
  node: Widget;
}

export interface CommentWidgetReaction {
  __typename?: "CommentWidgetReaction";
  widget: Widget;
  user: User;
  reaction: Scalars["String"];
}

export interface Notebook {
  __typename?: "Notebook";
  id: Scalars["UUID"];
  createdAt: Scalars["Time"];
  updatedAt: Scalars["Time"];
  owner: User;
  gitURL: Scalars["String"];
  gitBranch: Scalars["String"];
  markdown: Scalars["String"];
  starsCount: Scalars["Int"];
  dailyStarsCount: Maybe<Scalars["Int"]>;
  weeklyStarsCount: Maybe<Scalars["Int"]>;
  monthlyStarsCount: Maybe<Scalars["Int"]>;
  isStarred: Scalars["Boolean"];
}

export interface VerifyEmail {
  email: Scalars["String"];
  verificationCode: Scalars["String"];
}

export interface User {
  __typename?: "User";
  id: Scalars["UUID"];
  name: Maybe<Scalars["String"]>;
  username: Maybe<Scalars["String"]>;
  email: Maybe<Scalars["String"]>;
  verifiedEmail: Maybe<Scalars["String"]>;
  avatar: Maybe<Scalars["String"]>;
  cover: Maybe<Scalars["String"]>;
  bio: Maybe<Scalars["String"]>;
  location: Maybe<Scalars["String"]>;
  language: Maybe<Scalars["String"]>;
  createdAt: Maybe<Scalars["Time"]>;
  updatedAt: Maybe<Scalars["Time"]>;
  deletedAt: Maybe<Scalars["Time"]>;
  followingsCount: Maybe<Scalars["Int"]>;
  followersCount: Maybe<Scalars["Int"]>;
  widgetsCount: Maybe<Scalars["Int"]>;
  notebooksCount: Maybe<Scalars["Int"]>;
  starredNotebooksCount: Maybe<Scalars["Int"]>;
  isFollowing: Maybe<Scalars["Boolean"]>;
  areFriends: Maybe<Scalars["Boolean"]>;
  followings: Maybe<Array<User>>;
  followers: Maybe<Array<User>>;
  widgetSummaries: Array<UserWidget>;
  widgets: WidgetConnection;
  notifications: NotificationConnection;
  /** Get user owned notebooks */
  notebooks: NotebookConnection;
  /** Get user starred notebooks */
  starredNotebooks: NotebookConnection;
  editorCursorColor: Maybe<Scalars["String"]>;
  githubUser: Maybe<GitHubUser>;
}

export interface UserWidgetsArgs {
  type: WidgetType;
  before?: Maybe<Scalars["UUID"]>;
  after?: Maybe<Scalars["UUID"]>;
  first?: Maybe<Scalars["Int"]>;
  last?: Maybe<Scalars["Int"]>;
}

export interface UserNotificationsArgs {
  before?: Maybe<Scalars["UUID"]>;
  after?: Maybe<Scalars["UUID"]>;
  first?: Maybe<Scalars["Int"]>;
  last?: Maybe<Scalars["Int"]>;
}

export interface UserNotebooksArgs {
  before?: Maybe<Scalars["UUID"]>;
  after?: Maybe<Scalars["UUID"]>;
  first?: Maybe<Scalars["Int"]>;
  last?: Maybe<Scalars["Int"]>;
}

export interface UserStarredNotebooksArgs {
  before?: Maybe<Scalars["UUID"]>;
  after?: Maybe<Scalars["UUID"]>;
  first?: Maybe<Scalars["Int"]>;
  last?: Maybe<Scalars["Int"]>;
}

export interface CreateWidget {
  type: WidgetType;
  description: Scalars["String"];
  source: Scalars["String"];
}

export interface DeleteWidget {
  id: Scalars["UUID"];
}

export interface RemoveReactionFromCommentWidget {
  widgetID: Scalars["UUID"];
  reaction: Scalars["String"];
}

export interface AddReactionToCommentWidgetMessage {
  messageID: Scalars["UUID"];
  reaction: Scalars["String"];
}

export interface SubscribeToCommentWidget {
  widgetID: Scalars["UUID"];
}

export interface Mutation {
  __typename?: "Mutation";
  signUp: AuthReturn;
  signIn: AuthReturn;
  signUpWithGitHubAccount: AuthReturn;
  signInWithGitHubAccount: AuthReturn;
  deleteNotification: Scalars["Boolean"];
  deleteAllNotifications: Scalars["Boolean"];
  setUserInfo: User;
  followUser: Scalars["Boolean"];
  unfollowUser: Scalars["Boolean"];
  sendEmailVerificationCode: Scalars["Boolean"];
  resetPassword: Scalars["Boolean"];
  verifyEmail: Scalars["Boolean"];
  linkWithGitHubAccount: Scalars["Boolean"];
  unlinkGitHubAccount: Scalars["Boolean"];
  publishNotebook: Notebook;
  unpublishNotebook: Scalars["Boolean"];
  updateNotebook: Notebook;
  starNotebook: Scalars["Boolean"];
  unstarNotebook: Scalars["Boolean"];
  createWidget: Widget;
  updateWidget: Scalars["Boolean"];
  deleteWidget: Scalars["Boolean"];
  postCommentWidgetMessage: CommentWidgetMessage;
  updateCommentWidgetMessage: CommentWidgetMessage;
  addReactionToCommentWidget: Scalars["Boolean"];
  removeReactionFromCommentWidget: Scalars["Boolean"];
  addReactionToCommentWidgetMessage: Scalars["Boolean"];
  removeReactionFromCommentWidgetMessage: Scalars["Boolean"];
  subscribeToCommentWidget: Scalars["Boolean"];
  unsubscribeFromCommentWidget: Scalars["Boolean"];
}

export interface MutationSignUpArgs {
  input: SignUpInput;
}

export interface MutationSignInArgs {
  input: SignInInput;
}

export interface MutationSignUpWithGitHubAccountArgs {
  input: SignUpWithGitHubAccount;
}

export interface MutationSignInWithGitHubAccountArgs {
  input: SignInWithGitHubAccount;
}

export interface MutationDeleteNotificationArgs {
  input: DeleteNotification;
}

export interface MutationSetUserInfoArgs {
  input: SetUserInfo;
}

export interface MutationFollowUserArgs {
  input: FollowUser;
}

export interface MutationUnfollowUserArgs {
  input: UnfollowUser;
}

export interface MutationSendEmailVerificationCodeArgs {
  input: Maybe<SendEmailVerificationCode>;
}

export interface MutationResetPasswordArgs {
  input: Maybe<ResetPassword>;
}

export interface MutationVerifyEmailArgs {
  input: Maybe<VerifyEmail>;
}

export interface MutationLinkWithGitHubAccountArgs {
  input: Maybe<LinkWithGitHubAccount>;
}

export interface MutationPublishNotebookArgs {
  input: PublishNotebook;
}

export interface MutationUnpublishNotebookArgs {
  input: UnpublishNotebook;
}

export interface MutationUpdateNotebookArgs {
  input: UpdateNotebook;
}

export interface MutationStarNotebookArgs {
  input: StarNotebook;
}

export interface MutationUnstarNotebookArgs {
  input: UnstarNotebook;
}

export interface MutationCreateWidgetArgs {
  input: Maybe<CreateWidget>;
}

export interface MutationUpdateWidgetArgs {
  input: Maybe<UpdateWidget>;
}

export interface MutationDeleteWidgetArgs {
  input: Maybe<DeleteWidget>;
}

export interface MutationPostCommentWidgetMessageArgs {
  input: PostCommentWidgetMessage;
}

export interface MutationUpdateCommentWidgetMessageArgs {
  input: UpdateCommentWidgetMessage;
}

export interface MutationAddReactionToCommentWidgetArgs {
  input: Maybe<AddReactionToCommentWidget>;
}

export interface MutationRemoveReactionFromCommentWidgetArgs {
  input: Maybe<RemoveReactionFromCommentWidget>;
}

export interface MutationAddReactionToCommentWidgetMessageArgs {
  input: Maybe<AddReactionToCommentWidgetMessage>;
}

export interface MutationRemoveReactionFromCommentWidgetMessageArgs {
  input: Maybe<RemoveReactionFromCommentWidgetMessage>;
}

export interface MutationSubscribeToCommentWidgetArgs {
  input: Maybe<SubscribeToCommentWidget>;
}

export interface MutationUnsubscribeFromCommentWidgetArgs {
  input: Maybe<UnsubscribeFromCommentWidget>;
}

export interface UnfollowUser {
  userID: Scalars["UUID"];
}

export interface UnstarNotebook {
  notebookID: Scalars["UUID"];
}

export type SignUpMutationVariables = {
  username: Scalars["String"];
  email: Scalars["String"];
  password: Scalars["String"];
};

export type SignUpMutation = { __typename?: "Mutation" } & {
  signUp: { __typename?: "AuthReturn" } & Pick<AuthReturn, "token"> & {
      user: { __typename?: "User" } & Pick<User, "id">;
    };
};

export type SignInMutationVariables = {
  email: Scalars["String"];
  password: Scalars["String"];
};

export type SignInMutation = { __typename?: "Mutation" } & {
  signIn: { __typename?: "AuthReturn" } & Pick<AuthReturn, "token"> & {
      user: { __typename?: "User" } & Pick<User, "id">;
    };
};

export type SignUpWithGitHubAccountMutationVariables = {
  username: Scalars["String"];
  email: Scalars["String"];
  accessToken: Scalars["String"];
};

export type SignUpWithGitHubAccountMutation = { __typename?: "Mutation" } & {
  signUpWithGitHubAccount: { __typename?: "AuthReturn" } & Pick<
    AuthReturn,
    "token"
  > & { user: { __typename?: "User" } & Pick<User, "id"> };
};

export type SignInWithGitHubAccountMutationVariables = {
  code: Scalars["String"];
};

export type SignInWithGitHubAccountMutation = { __typename?: "Mutation" } & {
  signInWithGitHubAccount: { __typename?: "AuthReturn" } & Pick<
    AuthReturn,
    "token"
  > & {
      user: { __typename?: "User" } & Pick<User, "id" | "username" | "email">;
    };
};

export type SendEmailVerificationCodeMutationVariables = {
  email: Scalars["String"];
};

export type SendEmailVerificationCodeMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "sendEmailVerificationCode">;

export type ResetPasswordMutationVariables = {
  email: Scalars["String"];
  verificationCode: Scalars["String"];
  password: Scalars["String"];
};

export type ResetPasswordMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "resetPassword"
>;

export type VerifyEmailMutationVariables = {
  email: Scalars["String"];
  verificationCode: Scalars["String"];
};

export type VerifyEmailMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "verifyEmail"
>;

export type CreateCommentWidgetMutationVariables = {
  description: Scalars["String"];
  source: Scalars["String"];
};

export type CreateCommentWidgetMutation = { __typename?: "Mutation" } & {
  createWidget: { __typename?: "Widget" } & Pick<Widget, "id">;
};

export type PostCommentWidgetMessageMutationVariables = {
  widgetID: Scalars["UUID"];
  markdown: Scalars["String"];
  notifyUsers: Array<Scalars["String"]>;
};

export type PostCommentWidgetMessageMutation = { __typename?: "Mutation" } & {
  postCommentWidgetMessage: {
    __typename?: "CommentWidgetMessage";
  } & CommentWidgetMessageFieldsFragment;
};

export type UpdateCommentWidgetMessageMutationVariables = {
  messageID: Scalars["UUID"];
  markdown: Scalars["String"];
};

export type UpdateCommentWidgetMessageMutation = { __typename?: "Mutation" } & {
  updateCommentWidgetMessage: {
    __typename?: "CommentWidgetMessage";
  } & CommentWidgetMessageFieldsFragment;
};

export type AddReactionToCommentWidgetMutationVariables = {
  widgetID: Scalars["UUID"];
  reaction: Scalars["String"];
};

export type AddReactionToCommentWidgetMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "addReactionToCommentWidget">;

export type RemoveReactionFromCommentWidgetMutationVariables = {
  widgetID: Scalars["UUID"];
  reaction: Scalars["String"];
};

export type RemoveReactionFromCommentWidgetMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "removeReactionFromCommentWidget">;

export type AddReactionToCommentWidgetMessageMutationVariables = {
  messageID: Scalars["UUID"];
  reaction: Scalars["String"];
};

export type AddReactionToCommentWidgetMessageMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "addReactionToCommentWidgetMessage">;

export type RemoveReactionFromCommentWidgetMessageMutationVariables = {
  messageID: Scalars["UUID"];
  reaction: Scalars["String"];
};

export type RemoveReactionFromCommentWidgetMessageMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "removeReactionFromCommentWidgetMessage">;

export type SubscribeToCommentWidgetMutationVariables = {
  widgetID: Scalars["UUID"];
};

export type SubscribeToCommentWidgetMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "subscribeToCommentWidget">;

export type UnsubscribeFromCommentWidgetMutationVariables = {
  widgetID: Scalars["UUID"];
};

export type UnsubscribeFromCommentWidgetMutation = {
  __typename?: "Mutation";
} & Pick<Mutation, "unsubscribeFromCommentWidget">;

export type LinkWithGitHubAccountMutationVariables = {
  code: Scalars["String"];
};

export type LinkWithGitHubAccountMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "linkWithGitHubAccount"
>;

export type UnlinkGitHubAccountMutationVariables = {};

export type UnlinkGitHubAccountMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "unlinkGitHubAccount"
>;

export type PublishNotebookMutationVariables = {
  gitURL: Scalars["String"];
  gitBranch: Scalars["String"];
};

export type PublishNotebookMutation = { __typename?: "Mutation" } & {
  publishNotebook: { __typename?: "Notebook" } & NotebookFieldsFragment;
};

export type UnpublishNotebookMutationVariables = {
  notebookID: Scalars["UUID"];
};

export type UnpublishNotebookMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "unpublishNotebook"
>;

export type UpdateNotebookMutationVariables = {
  notebookID: Scalars["UUID"];
  gitURL: Scalars["String"];
  gitBranch: Scalars["String"];
};

export type UpdateNotebookMutation = { __typename?: "Mutation" } & {
  updateNotebook: { __typename?: "Notebook" } & NotebookFieldsFragment;
};

export type StarNotebookMutationVariables = {
  notebookID: Scalars["UUID"];
};

export type StarNotebookMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "starNotebook"
>;

export type UnstarNotebookMutationVariables = {
  notebookID: Scalars["UUID"];
};

export type UnstarNotebookMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "unstarNotebook"
>;

export type DeleteNotificationMutationVariables = {
  notificationID: Scalars["UUID"];
};

export type DeleteNotificationMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "deleteNotification"
>;

export type DeleteAllNotificationsMutationVariables = {};

export type DeleteAllNotificationsMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "deleteAllNotifications"
>;

export type SetUserInfoMutationVariables = {
  cover: Scalars["String"];
  bio: Scalars["String"];
  location: Scalars["String"];
  language: Scalars["String"];
  name: Scalars["String"];
  avatar: Scalars["String"];
  editorCursorColor: Scalars["String"];
};

export type SetUserInfoMutation = { __typename?: "Mutation" } & {
  setUserInfo: { __typename?: "User" } & ViewerFieldsFragment;
};

export type DeleteWidgetMutationVariables = {
  id: Scalars["UUID"];
};

export type DeleteWidgetMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "deleteWidget"
>;

export type UpdateWidgetMutationVariables = {
  id: Scalars["UUID"];
  description: Scalars["String"];
  source: Scalars["String"];
};

export type UpdateWidgetMutation = { __typename?: "Mutation" } & Pick<
  Mutation,
  "updateWidget"
>;

export type CommentWidgetMessageFieldsFragment = {
  __typename?: "CommentWidgetMessage";
} & Pick<
  CommentWidgetMessage,
  "id" | "markdown" | "createdAt" | "updatedAt"
> & {
    author: { __typename?: "User" } & Pick<User, "id" | "username" | "avatar">;
    reactionSummaries: Array<
      { __typename?: "ReactionSummary" } & Pick<
        ReactionSummary,
        "count" | "reaction" | "selfAuthored"
      >
    >;
  };

export type CommentWidgetMessageConnectionFieldsFragment = {
  __typename?: "CommentWidgetMessageConnection";
} & {
  pageInfo: { __typename?: "PageInfo" } & PageInfoFieldsFragment;
  edges: Array<
    { __typename?: "CommentWidgetMessageEdge" } & Pick<
      CommentWidgetMessageEdge,
      "cursor"
    > & {
        node: {
          __typename?: "CommentWidgetMessage";
        } & CommentWidgetMessageFieldsFragment;
      }
  >;
};

export type CommentWidgetFieldsFragment = { __typename?: "Widget" } & Pick<
  Widget,
  "id" | "description" | "source" | "canConfigure"
> & {
    owner: { __typename?: "User" } & Pick<User, "id" | "username" | "avatar">;
    instance: { __typename?: "CommentWidgetInstance" } & Pick<
      CommentWidgetInstance,
      "type"
    > & {
        commentWidget: { __typename?: "CommentWidget" } & Pick<
          CommentWidget,
          | "id"
          | "createdAt"
          | "updatedAt"
          | "messagesCount"
          | "reactionsCount"
          | "subscribed"
        > & {
            reactionSummaries: Array<
              { __typename?: "ReactionSummary" } & Pick<
                ReactionSummary,
                "count" | "reaction" | "selfAuthored"
              >
            >;
            messages: {
              __typename?: "CommentWidgetMessageConnection";
            } & CommentWidgetMessageConnectionFieldsFragment;
          };
      };
  };

export type CommentWidgetQueryVariables = {
  widgetID: Scalars["UUID"];
};

export type CommentWidgetQuery = { __typename?: "Query" } & {
  widget: { __typename?: "Widget" } & CommentWidgetFieldsFragment;
};

export type CommentWidgetMessagesQueryVariables = {
  widgetID: Scalars["UUID"];
  before: Scalars["UUID"];
  after: Scalars["UUID"];
  first: Scalars["Int"];
  last: Scalars["Int"];
};

export type CommentWidgetMessagesQuery = { __typename?: "Query" } & {
  widget: { __typename?: "Widget" } & {
    instance: { __typename?: "CommentWidgetInstance" } & Pick<
      CommentWidgetInstance,
      "type"
    > & {
        commentWidget: { __typename?: "CommentWidget" } & {
          messages: {
            __typename?: "CommentWidgetMessageConnection";
          } & CommentWidgetMessageConnectionFieldsFragment;
        };
      };
  };
};

export type GitHubUserQueryVariables = {};

export type GitHubUserQuery = { __typename?: "Query" } & {
  viewer: { __typename?: "User" } & {
    githubUser: Maybe<
      { __typename?: "GitHubUser" } & Pick<
        GitHubUser,
        "login" | "avatar" | "email"
      >
    >;
  };
};

export type NotebookFieldsFragment = { __typename?: "Notebook" } & Pick<
  Notebook,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "gitURL"
  | "gitBranch"
  | "markdown"
  | "starsCount"
  | "isStarred"
> & {
    owner: { __typename?: "User" } & Pick<User, "id" | "avatar" | "username">;
  };

export type NotebooksQueryVariables = {
  query?: Maybe<Scalars["String"]>;
  orderBy?: Maybe<NotebookOrderBy>;
  page?: Maybe<Scalars["Int"]>;
  perPage?: Maybe<Scalars["Int"]>;
};

export type NotebooksQuery = { __typename?: "Query" } & {
  notebooks: Array<{ __typename?: "Notebook" } & NotebookFieldsFragment>;
};

export type NotificationFieldsFragment = { __typename?: "Notification" } & Pick<
  Notification,
  "id" | "createdAt" | "meta"
> & {
    origin: { __typename?: "User" } & Pick<User, "id" | "username" | "avatar">;
    receiver: { __typename?: "User" } & Pick<
      User,
      "id" | "username" | "avatar"
    >;
    event:
      | ({ __typename?: "NotificationEventCommentWidgetMessagePosting" } & Pick<
          NotificationEventCommentWidgetMessagePosting,
          "type"
        > & {
            message: { __typename?: "CommentWidgetMessage" } & Pick<
              CommentWidgetMessage,
              "id" | "markdown" | "createdAt"
            > & {
                widget: { __typename?: "Widget" } & Pick<
                  Widget,
                  "description" | "source"
                > & {
                    owner: { __typename?: "User" } & Pick<
                      User,
                      "id" | "username" | "avatar"
                    >;
                  };
              };
          })
      | ({ __typename?: "NotificationEventUserFollowing" } & Pick<
          NotificationEventUserFollowing,
          "type"
        >);
  };

export type NotificationsQueryVariables = {
  before: Scalars["UUID"];
  after: Scalars["UUID"];
  first: Maybe<Scalars["Int"]>;
  last: Maybe<Scalars["Int"]>;
};

export type NotificationsQuery = { __typename?: "Query" } & {
  viewer: { __typename?: "User" } & {
    notifications: { __typename?: "NotificationConnection" } & {
      pageInfo: { __typename?: "PageInfo" } & PageInfoFieldsFragment;
      edges: Array<
        { __typename?: "NotificationEdge" } & Pick<
          NotificationEdge,
          "cursor"
        > & {
            node: { __typename?: "Notification" } & NotificationFieldsFragment;
          }
      >;
    };
  };
};

export type PageInfoFieldsFragment = { __typename?: "PageInfo" } & Pick<
  PageInfo,
  "startCursor" | "endCursor" | "hasNextPage" | "hasPreviousPage"
>;

export type ViewerFieldsFragment = { __typename?: "User" } & Pick<
  User,
  | "avatar"
  | "bio"
  | "cover"
  | "createdAt"
  | "deletedAt"
  | "id"
  | "language"
  | "name"
  | "username"
  | "email"
  | "verifiedEmail"
  | "updatedAt"
  | "widgetsCount"
  | "notebooksCount"
  | "starredNotebooksCount"
  | "editorCursorColor"
> & {
    notifications: { __typename?: "NotificationConnection" } & Pick<
      NotificationConnection,
      "totalCount"
    >;
  };

export type ViewerQueryVariables = {};

export type ViewerQuery = { __typename?: "Query" } & {
  viewer: { __typename?: "User" } & ViewerFieldsFragment;
};

export const PageInfoFieldsFragmentDoc = gql`
  fragment PageInfoFields on PageInfo {
    startCursor
    endCursor
    hasNextPage
    hasPreviousPage
  }
`;
export const CommentWidgetMessageFieldsFragmentDoc = gql`
  fragment CommentWidgetMessageFields on CommentWidgetMessage {
    id
    author {
      id
      username
      avatar
    }
    markdown
    createdAt
    updatedAt
    reactionSummaries {
      count
      reaction
      selfAuthored
    }
  }
`;
export const CommentWidgetMessageConnectionFieldsFragmentDoc = gql`
  fragment CommentWidgetMessageConnectionFields on CommentWidgetMessageConnection {
    pageInfo {
      ...PageInfoFields
    }
    edges {
      cursor
      node {
        ...CommentWidgetMessageFields
      }
    }
  }
  ${PageInfoFieldsFragmentDoc}
  ${CommentWidgetMessageFieldsFragmentDoc}
`;
export const CommentWidgetFieldsFragmentDoc = gql`
  fragment CommentWidgetFields on Widget {
    id
    owner {
      id
      username
      avatar
    }
    description
    source
    canConfigure
    instance {
      type
      ... on CommentWidgetInstance {
        type
        commentWidget {
          id
          createdAt
          updatedAt
          messagesCount
          reactionsCount
          subscribed
          reactionSummaries {
            count
            reaction
            selfAuthored
          }
          messages(first: 20) {
            ...CommentWidgetMessageConnectionFields
          }
        }
      }
    }
  }
  ${CommentWidgetMessageConnectionFieldsFragmentDoc}
`;
export const NotebookFieldsFragmentDoc = gql`
  fragment NotebookFields on Notebook {
    id
    createdAt
    updatedAt
    owner {
      id
      avatar
      username
    }
    gitURL
    gitBranch
    markdown
    starsCount
    isStarred
  }
`;
export const NotificationFieldsFragmentDoc = gql`
  fragment NotificationFields on Notification {
    id
    createdAt
    origin {
      id
      username
      avatar
    }
    receiver {
      id
      username
      avatar
    }
    meta
    event {
      type
      ... on NotificationEventUserFollowing {
        type
      }
      ... on NotificationEventCommentWidgetMessagePosting {
        type
        message {
          id
          markdown
          createdAt
          widget {
            owner {
              id
              username
              avatar
            }
            description
            source
          }
        }
      }
    }
  }
`;
export const ViewerFieldsFragmentDoc = gql`
  fragment ViewerFields on User {
    avatar
    bio
    cover
    createdAt
    deletedAt
    id
    language
    name
    username
    email
    verifiedEmail
    updatedAt
    widgetsCount
    notebooksCount
    starredNotebooksCount
    notifications(last: 1) {
      totalCount
    }
    editorCursorColor
  }
`;
export const SignUpDocument = gql`
  mutation SignUp($username: String!, $email: String!, $password: String!) {
    signUp(input: { username: $username, email: $email, password: $password }) {
      token
      user {
        id
      }
    }
  }
`;

export const SignUpComponent = (
  props: Omit<
    Urql.MutationProps<SignUpMutation, SignUpMutationVariables>,
    "query"
  > & { variables?: SignUpMutationVariables },
) => <Urql.Mutation {...props} query={SignUpDocument} />;

export function useSignUpMutation() {
  return Urql.useMutation<SignUpMutation, SignUpMutationVariables>(
    SignUpDocument,
  );
}
export const SignInDocument = gql`
  mutation SignIn($email: String!, $password: String!) {
    signIn(input: { email: $email, password: $password }) {
      token
      user {
        id
      }
    }
  }
`;

export const SignInComponent = (
  props: Omit<
    Urql.MutationProps<SignInMutation, SignInMutationVariables>,
    "query"
  > & { variables?: SignInMutationVariables },
) => <Urql.Mutation {...props} query={SignInDocument} />;

export function useSignInMutation() {
  return Urql.useMutation<SignInMutation, SignInMutationVariables>(
    SignInDocument,
  );
}
export const SignUpWithGitHubAccountDocument = gql`
  mutation SignUpWithGitHubAccount(
    $username: String!
    $email: String!
    $accessToken: String!
  ) {
    signUpWithGitHubAccount(
      input: { username: $username, email: $email, accessToken: $accessToken }
    ) {
      token
      user {
        id
      }
    }
  }
`;

export const SignUpWithGitHubAccountComponent = (
  props: Omit<
    Urql.MutationProps<
      SignUpWithGitHubAccountMutation,
      SignUpWithGitHubAccountMutationVariables
    >,
    "query"
  > & { variables?: SignUpWithGitHubAccountMutationVariables },
) => <Urql.Mutation {...props} query={SignUpWithGitHubAccountDocument} />;

export function useSignUpWithGitHubAccountMutation() {
  return Urql.useMutation<
    SignUpWithGitHubAccountMutation,
    SignUpWithGitHubAccountMutationVariables
  >(SignUpWithGitHubAccountDocument);
}
export const SignInWithGitHubAccountDocument = gql`
  mutation SignInWithGitHubAccount($code: String!) {
    signInWithGitHubAccount(input: { code: $code }) {
      token
      user {
        id
        username
        email
      }
    }
  }
`;

export const SignInWithGitHubAccountComponent = (
  props: Omit<
    Urql.MutationProps<
      SignInWithGitHubAccountMutation,
      SignInWithGitHubAccountMutationVariables
    >,
    "query"
  > & { variables?: SignInWithGitHubAccountMutationVariables },
) => <Urql.Mutation {...props} query={SignInWithGitHubAccountDocument} />;

export function useSignInWithGitHubAccountMutation() {
  return Urql.useMutation<
    SignInWithGitHubAccountMutation,
    SignInWithGitHubAccountMutationVariables
  >(SignInWithGitHubAccountDocument);
}
export const SendEmailVerificationCodeDocument = gql`
  mutation SendEmailVerificationCode($email: String!) {
    sendEmailVerificationCode(input: { email: $email })
  }
`;

export const SendEmailVerificationCodeComponent = (
  props: Omit<
    Urql.MutationProps<
      SendEmailVerificationCodeMutation,
      SendEmailVerificationCodeMutationVariables
    >,
    "query"
  > & { variables?: SendEmailVerificationCodeMutationVariables },
) => <Urql.Mutation {...props} query={SendEmailVerificationCodeDocument} />;

export function useSendEmailVerificationCodeMutation() {
  return Urql.useMutation<
    SendEmailVerificationCodeMutation,
    SendEmailVerificationCodeMutationVariables
  >(SendEmailVerificationCodeDocument);
}
export const ResetPasswordDocument = gql`
  mutation ResetPassword(
    $email: String!
    $verificationCode: String!
    $password: String!
  ) {
    resetPassword(
      input: {
        email: $email
        verificationCode: $verificationCode
        password: $password
      }
    )
  }
`;

export const ResetPasswordComponent = (
  props: Omit<
    Urql.MutationProps<ResetPasswordMutation, ResetPasswordMutationVariables>,
    "query"
  > & { variables?: ResetPasswordMutationVariables },
) => <Urql.Mutation {...props} query={ResetPasswordDocument} />;

export function useResetPasswordMutation() {
  return Urql.useMutation<
    ResetPasswordMutation,
    ResetPasswordMutationVariables
  >(ResetPasswordDocument);
}
export const VerifyEmailDocument = gql`
  mutation VerifyEmail($email: String!, $verificationCode: String!) {
    verifyEmail(input: { email: $email, verificationCode: $verificationCode })
  }
`;

export const VerifyEmailComponent = (
  props: Omit<
    Urql.MutationProps<VerifyEmailMutation, VerifyEmailMutationVariables>,
    "query"
  > & { variables?: VerifyEmailMutationVariables },
) => <Urql.Mutation {...props} query={VerifyEmailDocument} />;

export function useVerifyEmailMutation() {
  return Urql.useMutation<VerifyEmailMutation, VerifyEmailMutationVariables>(
    VerifyEmailDocument,
  );
}
export const CreateCommentWidgetDocument = gql`
  mutation CreateCommentWidget($description: String!, $source: String!) {
    createWidget(
      input: { description: $description, source: $source, type: COMMENT }
    ) {
      id
    }
  }
`;

export const CreateCommentWidgetComponent = (
  props: Omit<
    Urql.MutationProps<
      CreateCommentWidgetMutation,
      CreateCommentWidgetMutationVariables
    >,
    "query"
  > & { variables?: CreateCommentWidgetMutationVariables },
) => <Urql.Mutation {...props} query={CreateCommentWidgetDocument} />;

export function useCreateCommentWidgetMutation() {
  return Urql.useMutation<
    CreateCommentWidgetMutation,
    CreateCommentWidgetMutationVariables
  >(CreateCommentWidgetDocument);
}
export const PostCommentWidgetMessageDocument = gql`
  mutation PostCommentWidgetMessage(
    $widgetID: UUID!
    $markdown: String!
    $notifyUsers: [String!]!
  ) {
    postCommentWidgetMessage(
      input: {
        widgetID: $widgetID
        markdown: $markdown
        notifyUsers: $notifyUsers
      }
    ) {
      ...CommentWidgetMessageFields
    }
  }
  ${CommentWidgetMessageFieldsFragmentDoc}
`;

export const PostCommentWidgetMessageComponent = (
  props: Omit<
    Urql.MutationProps<
      PostCommentWidgetMessageMutation,
      PostCommentWidgetMessageMutationVariables
    >,
    "query"
  > & { variables?: PostCommentWidgetMessageMutationVariables },
) => <Urql.Mutation {...props} query={PostCommentWidgetMessageDocument} />;

export function usePostCommentWidgetMessageMutation() {
  return Urql.useMutation<
    PostCommentWidgetMessageMutation,
    PostCommentWidgetMessageMutationVariables
  >(PostCommentWidgetMessageDocument);
}
export const UpdateCommentWidgetMessageDocument = gql`
  mutation UpdateCommentWidgetMessage($messageID: UUID!, $markdown: String!) {
    updateCommentWidgetMessage(
      input: { messageID: $messageID, markdown: $markdown }
    ) {
      ...CommentWidgetMessageFields
    }
  }
  ${CommentWidgetMessageFieldsFragmentDoc}
`;

export const UpdateCommentWidgetMessageComponent = (
  props: Omit<
    Urql.MutationProps<
      UpdateCommentWidgetMessageMutation,
      UpdateCommentWidgetMessageMutationVariables
    >,
    "query"
  > & { variables?: UpdateCommentWidgetMessageMutationVariables },
) => <Urql.Mutation {...props} query={UpdateCommentWidgetMessageDocument} />;

export function useUpdateCommentWidgetMessageMutation() {
  return Urql.useMutation<
    UpdateCommentWidgetMessageMutation,
    UpdateCommentWidgetMessageMutationVariables
  >(UpdateCommentWidgetMessageDocument);
}
export const AddReactionToCommentWidgetDocument = gql`
  mutation AddReactionToCommentWidget($widgetID: UUID!, $reaction: String!) {
    addReactionToCommentWidget(
      input: { widgetID: $widgetID, reaction: $reaction }
    )
  }
`;

export const AddReactionToCommentWidgetComponent = (
  props: Omit<
    Urql.MutationProps<
      AddReactionToCommentWidgetMutation,
      AddReactionToCommentWidgetMutationVariables
    >,
    "query"
  > & { variables?: AddReactionToCommentWidgetMutationVariables },
) => <Urql.Mutation {...props} query={AddReactionToCommentWidgetDocument} />;

export function useAddReactionToCommentWidgetMutation() {
  return Urql.useMutation<
    AddReactionToCommentWidgetMutation,
    AddReactionToCommentWidgetMutationVariables
  >(AddReactionToCommentWidgetDocument);
}
export const RemoveReactionFromCommentWidgetDocument = gql`
  mutation RemoveReactionFromCommentWidget(
    $widgetID: UUID!
    $reaction: String!
  ) {
    removeReactionFromCommentWidget(
      input: { widgetID: $widgetID, reaction: $reaction }
    )
  }
`;

export const RemoveReactionFromCommentWidgetComponent = (
  props: Omit<
    Urql.MutationProps<
      RemoveReactionFromCommentWidgetMutation,
      RemoveReactionFromCommentWidgetMutationVariables
    >,
    "query"
  > & { variables?: RemoveReactionFromCommentWidgetMutationVariables },
) => (
  <Urql.Mutation {...props} query={RemoveReactionFromCommentWidgetDocument} />
);

export function useRemoveReactionFromCommentWidgetMutation() {
  return Urql.useMutation<
    RemoveReactionFromCommentWidgetMutation,
    RemoveReactionFromCommentWidgetMutationVariables
  >(RemoveReactionFromCommentWidgetDocument);
}
export const AddReactionToCommentWidgetMessageDocument = gql`
  mutation AddReactionToCommentWidgetMessage(
    $messageID: UUID!
    $reaction: String!
  ) {
    addReactionToCommentWidgetMessage(
      input: { messageID: $messageID, reaction: $reaction }
    )
  }
`;

export const AddReactionToCommentWidgetMessageComponent = (
  props: Omit<
    Urql.MutationProps<
      AddReactionToCommentWidgetMessageMutation,
      AddReactionToCommentWidgetMessageMutationVariables
    >,
    "query"
  > & { variables?: AddReactionToCommentWidgetMessageMutationVariables },
) => (
  <Urql.Mutation {...props} query={AddReactionToCommentWidgetMessageDocument} />
);

export function useAddReactionToCommentWidgetMessageMutation() {
  return Urql.useMutation<
    AddReactionToCommentWidgetMessageMutation,
    AddReactionToCommentWidgetMessageMutationVariables
  >(AddReactionToCommentWidgetMessageDocument);
}
export const RemoveReactionFromCommentWidgetMessageDocument = gql`
  mutation RemoveReactionFromCommentWidgetMessage(
    $messageID: UUID!
    $reaction: String!
  ) {
    removeReactionFromCommentWidgetMessage(
      input: { messageID: $messageID, reaction: $reaction }
    )
  }
`;

export const RemoveReactionFromCommentWidgetMessageComponent = (
  props: Omit<
    Urql.MutationProps<
      RemoveReactionFromCommentWidgetMessageMutation,
      RemoveReactionFromCommentWidgetMessageMutationVariables
    >,
    "query"
  > & { variables?: RemoveReactionFromCommentWidgetMessageMutationVariables },
) => (
  <Urql.Mutation
    {...props}
    query={RemoveReactionFromCommentWidgetMessageDocument}
  />
);

export function useRemoveReactionFromCommentWidgetMessageMutation() {
  return Urql.useMutation<
    RemoveReactionFromCommentWidgetMessageMutation,
    RemoveReactionFromCommentWidgetMessageMutationVariables
  >(RemoveReactionFromCommentWidgetMessageDocument);
}
export const SubscribeToCommentWidgetDocument = gql`
  mutation SubscribeToCommentWidget($widgetID: UUID!) {
    subscribeToCommentWidget(input: { widgetID: $widgetID })
  }
`;

export const SubscribeToCommentWidgetComponent = (
  props: Omit<
    Urql.MutationProps<
      SubscribeToCommentWidgetMutation,
      SubscribeToCommentWidgetMutationVariables
    >,
    "query"
  > & { variables?: SubscribeToCommentWidgetMutationVariables },
) => <Urql.Mutation {...props} query={SubscribeToCommentWidgetDocument} />;

export function useSubscribeToCommentWidgetMutation() {
  return Urql.useMutation<
    SubscribeToCommentWidgetMutation,
    SubscribeToCommentWidgetMutationVariables
  >(SubscribeToCommentWidgetDocument);
}
export const UnsubscribeFromCommentWidgetDocument = gql`
  mutation UnsubscribeFromCommentWidget($widgetID: UUID!) {
    unsubscribeFromCommentWidget(input: { widgetID: $widgetID })
  }
`;

export const UnsubscribeFromCommentWidgetComponent = (
  props: Omit<
    Urql.MutationProps<
      UnsubscribeFromCommentWidgetMutation,
      UnsubscribeFromCommentWidgetMutationVariables
    >,
    "query"
  > & { variables?: UnsubscribeFromCommentWidgetMutationVariables },
) => <Urql.Mutation {...props} query={UnsubscribeFromCommentWidgetDocument} />;

export function useUnsubscribeFromCommentWidgetMutation() {
  return Urql.useMutation<
    UnsubscribeFromCommentWidgetMutation,
    UnsubscribeFromCommentWidgetMutationVariables
  >(UnsubscribeFromCommentWidgetDocument);
}
export const LinkWithGitHubAccountDocument = gql`
  mutation LinkWithGitHubAccount($code: String!) {
    linkWithGitHubAccount(input: { code: $code })
  }
`;

export const LinkWithGitHubAccountComponent = (
  props: Omit<
    Urql.MutationProps<
      LinkWithGitHubAccountMutation,
      LinkWithGitHubAccountMutationVariables
    >,
    "query"
  > & { variables?: LinkWithGitHubAccountMutationVariables },
) => <Urql.Mutation {...props} query={LinkWithGitHubAccountDocument} />;

export function useLinkWithGitHubAccountMutation() {
  return Urql.useMutation<
    LinkWithGitHubAccountMutation,
    LinkWithGitHubAccountMutationVariables
  >(LinkWithGitHubAccountDocument);
}
export const UnlinkGitHubAccountDocument = gql`
  mutation UnlinkGitHubAccount {
    unlinkGitHubAccount
  }
`;

export const UnlinkGitHubAccountComponent = (
  props: Omit<
    Urql.MutationProps<
      UnlinkGitHubAccountMutation,
      UnlinkGitHubAccountMutationVariables
    >,
    "query"
  > & { variables?: UnlinkGitHubAccountMutationVariables },
) => <Urql.Mutation {...props} query={UnlinkGitHubAccountDocument} />;

export function useUnlinkGitHubAccountMutation() {
  return Urql.useMutation<
    UnlinkGitHubAccountMutation,
    UnlinkGitHubAccountMutationVariables
  >(UnlinkGitHubAccountDocument);
}
export const PublishNotebookDocument = gql`
  mutation PublishNotebook($gitURL: String!, $gitBranch: String!) {
    publishNotebook(input: { gitURL: $gitURL, gitBranch: $gitBranch }) {
      ...NotebookFields
    }
  }
  ${NotebookFieldsFragmentDoc}
`;

export const PublishNotebookComponent = (
  props: Omit<
    Urql.MutationProps<
      PublishNotebookMutation,
      PublishNotebookMutationVariables
    >,
    "query"
  > & { variables?: PublishNotebookMutationVariables },
) => <Urql.Mutation {...props} query={PublishNotebookDocument} />;

export function usePublishNotebookMutation() {
  return Urql.useMutation<
    PublishNotebookMutation,
    PublishNotebookMutationVariables
  >(PublishNotebookDocument);
}
export const UnpublishNotebookDocument = gql`
  mutation UnpublishNotebook($notebookID: UUID!) {
    unpublishNotebook(input: { notebookID: $notebookID })
  }
`;

export const UnpublishNotebookComponent = (
  props: Omit<
    Urql.MutationProps<
      UnpublishNotebookMutation,
      UnpublishNotebookMutationVariables
    >,
    "query"
  > & { variables?: UnpublishNotebookMutationVariables },
) => <Urql.Mutation {...props} query={UnpublishNotebookDocument} />;

export function useUnpublishNotebookMutation() {
  return Urql.useMutation<
    UnpublishNotebookMutation,
    UnpublishNotebookMutationVariables
  >(UnpublishNotebookDocument);
}
export const UpdateNotebookDocument = gql`
  mutation UpdateNotebook(
    $notebookID: UUID!
    $gitURL: String!
    $gitBranch: String!
  ) {
    updateNotebook(
      input: { notebookID: $notebookID, gitURL: $gitURL, gitBranch: $gitBranch }
    ) {
      ...NotebookFields
    }
  }
  ${NotebookFieldsFragmentDoc}
`;

export const UpdateNotebookComponent = (
  props: Omit<
    Urql.MutationProps<UpdateNotebookMutation, UpdateNotebookMutationVariables>,
    "query"
  > & { variables?: UpdateNotebookMutationVariables },
) => <Urql.Mutation {...props} query={UpdateNotebookDocument} />;

export function useUpdateNotebookMutation() {
  return Urql.useMutation<
    UpdateNotebookMutation,
    UpdateNotebookMutationVariables
  >(UpdateNotebookDocument);
}
export const StarNotebookDocument = gql`
  mutation StarNotebook($notebookID: UUID!) {
    starNotebook(input: { notebookID: $notebookID })
  }
`;

export const StarNotebookComponent = (
  props: Omit<
    Urql.MutationProps<StarNotebookMutation, StarNotebookMutationVariables>,
    "query"
  > & { variables?: StarNotebookMutationVariables },
) => <Urql.Mutation {...props} query={StarNotebookDocument} />;

export function useStarNotebookMutation() {
  return Urql.useMutation<StarNotebookMutation, StarNotebookMutationVariables>(
    StarNotebookDocument,
  );
}
export const UnstarNotebookDocument = gql`
  mutation UnstarNotebook($notebookID: UUID!) {
    unstarNotebook(input: { notebookID: $notebookID })
  }
`;

export const UnstarNotebookComponent = (
  props: Omit<
    Urql.MutationProps<UnstarNotebookMutation, UnstarNotebookMutationVariables>,
    "query"
  > & { variables?: UnstarNotebookMutationVariables },
) => <Urql.Mutation {...props} query={UnstarNotebookDocument} />;

export function useUnstarNotebookMutation() {
  return Urql.useMutation<
    UnstarNotebookMutation,
    UnstarNotebookMutationVariables
  >(UnstarNotebookDocument);
}
export const DeleteNotificationDocument = gql`
  mutation DeleteNotification($notificationID: UUID!) {
    deleteNotification(input: { notificationID: $notificationID })
  }
`;

export const DeleteNotificationComponent = (
  props: Omit<
    Urql.MutationProps<
      DeleteNotificationMutation,
      DeleteNotificationMutationVariables
    >,
    "query"
  > & { variables?: DeleteNotificationMutationVariables },
) => <Urql.Mutation {...props} query={DeleteNotificationDocument} />;

export function useDeleteNotificationMutation() {
  return Urql.useMutation<
    DeleteNotificationMutation,
    DeleteNotificationMutationVariables
  >(DeleteNotificationDocument);
}
export const DeleteAllNotificationsDocument = gql`
  mutation DeleteAllNotifications {
    deleteAllNotifications
  }
`;

export const DeleteAllNotificationsComponent = (
  props: Omit<
    Urql.MutationProps<
      DeleteAllNotificationsMutation,
      DeleteAllNotificationsMutationVariables
    >,
    "query"
  > & { variables?: DeleteAllNotificationsMutationVariables },
) => <Urql.Mutation {...props} query={DeleteAllNotificationsDocument} />;

export function useDeleteAllNotificationsMutation() {
  return Urql.useMutation<
    DeleteAllNotificationsMutation,
    DeleteAllNotificationsMutationVariables
  >(DeleteAllNotificationsDocument);
}
export const SetUserInfoDocument = gql`
  mutation SetUserInfo(
    $cover: String!
    $bio: String!
    $location: String!
    $language: String!
    $name: String!
    $avatar: String!
    $editorCursorColor: String!
  ) {
    setUserInfo(
      input: {
        cover: $cover
        bio: $bio
        location: $location
        language: $language
        name: $name
        avatar: $avatar
        editorCursorColor: $editorCursorColor
      }
    ) {
      ...ViewerFields
    }
  }
  ${ViewerFieldsFragmentDoc}
`;

export const SetUserInfoComponent = (
  props: Omit<
    Urql.MutationProps<SetUserInfoMutation, SetUserInfoMutationVariables>,
    "query"
  > & { variables?: SetUserInfoMutationVariables },
) => <Urql.Mutation {...props} query={SetUserInfoDocument} />;

export function useSetUserInfoMutation() {
  return Urql.useMutation<SetUserInfoMutation, SetUserInfoMutationVariables>(
    SetUserInfoDocument,
  );
}
export const DeleteWidgetDocument = gql`
  mutation DeleteWidget($id: UUID!) {
    deleteWidget(input: { id: $id })
  }
`;

export const DeleteWidgetComponent = (
  props: Omit<
    Urql.MutationProps<DeleteWidgetMutation, DeleteWidgetMutationVariables>,
    "query"
  > & { variables?: DeleteWidgetMutationVariables },
) => <Urql.Mutation {...props} query={DeleteWidgetDocument} />;

export function useDeleteWidgetMutation() {
  return Urql.useMutation<DeleteWidgetMutation, DeleteWidgetMutationVariables>(
    DeleteWidgetDocument,
  );
}
export const UpdateWidgetDocument = gql`
  mutation UpdateWidget($id: UUID!, $description: String!, $source: String!) {
    updateWidget(input: { id: $id, description: $description, source: $source })
  }
`;

export const UpdateWidgetComponent = (
  props: Omit<
    Urql.MutationProps<UpdateWidgetMutation, UpdateWidgetMutationVariables>,
    "query"
  > & { variables?: UpdateWidgetMutationVariables },
) => <Urql.Mutation {...props} query={UpdateWidgetDocument} />;

export function useUpdateWidgetMutation() {
  return Urql.useMutation<UpdateWidgetMutation, UpdateWidgetMutationVariables>(
    UpdateWidgetDocument,
  );
}
export const CommentWidgetDocument = gql`
  query CommentWidget($widgetID: UUID!) {
    widget(id: $widgetID) {
      ...CommentWidgetFields
    }
  }
  ${CommentWidgetFieldsFragmentDoc}
`;

export const CommentWidgetComponent = (
  props: Omit<
    Urql.QueryProps<CommentWidgetQuery, CommentWidgetQueryVariables>,
    "query"
  > & { variables: CommentWidgetQueryVariables },
) => <Urql.Query {...props} query={CommentWidgetDocument} />;

export function useCommentWidgetQuery(
  options: Omit<Urql.UseQueryArgs<CommentWidgetQueryVariables>, "query"> = {},
) {
  return Urql.useQuery<CommentWidgetQuery>({
    query: CommentWidgetDocument,
    ...options,
  });
}
export const CommentWidgetMessagesDocument = gql`
  query CommentWidgetMessages(
    $widgetID: UUID!
    $before: UUID!
    $after: UUID!
    $first: Int!
    $last: Int!
  ) {
    widget(id: $widgetID) {
      instance {
        type
        ... on CommentWidgetInstance {
          type
          commentWidget {
            messages(
              before: $before
              after: $after
              first: $first
              last: $last
            ) {
              ...CommentWidgetMessageConnectionFields
            }
          }
        }
      }
    }
  }
  ${CommentWidgetMessageConnectionFieldsFragmentDoc}
`;

export const CommentWidgetMessagesComponent = (
  props: Omit<
    Urql.QueryProps<
      CommentWidgetMessagesQuery,
      CommentWidgetMessagesQueryVariables
    >,
    "query"
  > & { variables: CommentWidgetMessagesQueryVariables },
) => <Urql.Query {...props} query={CommentWidgetMessagesDocument} />;

export function useCommentWidgetMessagesQuery(
  options: Omit<
    Urql.UseQueryArgs<CommentWidgetMessagesQueryVariables>,
    "query"
  > = {},
) {
  return Urql.useQuery<CommentWidgetMessagesQuery>({
    query: CommentWidgetMessagesDocument,
    ...options,
  });
}
export const GitHubUserDocument = gql`
  query GitHubUser {
    viewer {
      githubUser {
        login
        avatar
        email
      }
    }
  }
`;

export const GitHubUserComponent = (
  props: Omit<
    Urql.QueryProps<GitHubUserQuery, GitHubUserQueryVariables>,
    "query"
  > & { variables?: GitHubUserQueryVariables },
) => <Urql.Query {...props} query={GitHubUserDocument} />;

export function useGitHubUserQuery(
  options: Omit<Urql.UseQueryArgs<GitHubUserQueryVariables>, "query"> = {},
) {
  return Urql.useQuery<GitHubUserQuery>({
    query: GitHubUserDocument,
    ...options,
  });
}
export const NotebooksDocument = gql`
  query Notebooks(
    $query: String = ""
    $orderBy: NotebookOrderBy = TOTAL_STARS_COUNT
    $page: Int = 0
    $perPage: Int = 10
  ) {
    notebooks(
      query: $query
      orderBy: $orderBy
      page: $page
      perPage: $perPage
    ) {
      ...NotebookFields
    }
  }
  ${NotebookFieldsFragmentDoc}
`;

export const NotebooksComponent = (
  props: Omit<
    Urql.QueryProps<NotebooksQuery, NotebooksQueryVariables>,
    "query"
  > & { variables?: NotebooksQueryVariables },
) => <Urql.Query {...props} query={NotebooksDocument} />;

export function useNotebooksQuery(
  options: Omit<Urql.UseQueryArgs<NotebooksQueryVariables>, "query"> = {},
) {
  return Urql.useQuery<NotebooksQuery>({
    query: NotebooksDocument,
    ...options,
  });
}
export const NotificationsDocument = gql`
  query Notifications($before: UUID!, $after: UUID!, $first: Int, $last: Int) {
    viewer {
      notifications(
        before: $before
        after: $after
        first: $first
        last: $last
      ) {
        pageInfo {
          ...PageInfoFields
        }
        edges {
          cursor
          node {
            ...NotificationFields
          }
        }
      }
    }
  }
  ${PageInfoFieldsFragmentDoc}
  ${NotificationFieldsFragmentDoc}
`;

export const NotificationsComponent = (
  props: Omit<
    Urql.QueryProps<NotificationsQuery, NotificationsQueryVariables>,
    "query"
  > & { variables: NotificationsQueryVariables },
) => <Urql.Query {...props} query={NotificationsDocument} />;

export function useNotificationsQuery(
  options: Omit<Urql.UseQueryArgs<NotificationsQueryVariables>, "query"> = {},
) {
  return Urql.useQuery<NotificationsQuery>({
    query: NotificationsDocument,
    ...options,
  });
}
export const ViewerDocument = gql`
  query Viewer {
    viewer {
      ...ViewerFields
    }
  }
  ${ViewerFieldsFragmentDoc}
`;

export const ViewerComponent = (
  props: Omit<Urql.QueryProps<ViewerQuery, ViewerQueryVariables>, "query"> & {
    variables?: ViewerQueryVariables;
  },
) => <Urql.Query {...props} query={ViewerDocument} />;

export function useViewerQuery(
  options: Omit<Urql.UseQueryArgs<ViewerQueryVariables>, "query"> = {},
) {
  return Urql.useQuery<ViewerQuery>({ query: ViewerDocument, ...options });
}
