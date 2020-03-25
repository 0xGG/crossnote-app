import gql from 'graphql-tag';
import * as React from 'react';
import * as Urql from 'urql';
export type Maybe<T> = T | null;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
/** All built-in and custom scalars, mapped to their actual values */
export interface Scalars {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  UUID: any;
  Time: any;
  Upload: any;
}

export interface AddCollaboratorToNote {
  noteID: Scalars['UUID'];
  collaboratorID: Maybe<Scalars['UUID']>;
  collaboratorUsername: Maybe<Scalars['String']>;
}

export interface AddReactionToChatMessage {
  chatMessageID: Scalars['UUID'];
  reaction: Scalars['String'];
}

export interface AddReactionToNote {
  noteID: Scalars['UUID'];
  reaction: Scalars['String'];
}

export interface AddTagToNote {
  noteID: Scalars['UUID'];
  noteKey: Maybe<Scalars['UUID']>;
  tag: Scalars['String'];
}

export interface ArchiveNote {
  noteID: Scalars['UUID'];
}

export interface AttachToParentNote {
  noteID: Scalars['UUID'];
  parentNoteID: Scalars['UUID'];
}

export enum AuthorViewScope {
  All = 'ALL',
  Onymous = 'ONYMOUS',
  Anonymous = 'ANONYMOUS'
}

export enum AuthorVisibility {
  Onymous = 'ONYMOUS',
  Anonymous = 'ANONYMOUS'
}

export interface AuthReturn {
   __typename?: 'AuthReturn';
  token: Scalars['String'];
  user: User;
}

export interface BookmarkNote {
  noteID: Scalars['UUID'];
}

export interface ChatGroup {
   __typename?: 'ChatGroup';
  id: Scalars['UUID'];
  owner: User;
  messagesCount: Scalars['Int'];
  type: ChatGroupType;
  updatedAt: Maybe<Scalars['Time']>;
  note: Note;
  messages: ChatMessageConnection;
  subscribed: Scalars['Boolean'];
}


export interface ChatGroupMessagesArgs {
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}

export interface ChatGroupConnection {
   __typename?: 'ChatGroupConnection';
  totalCount: Scalars['Int'];
  pageInfo: PageInfo;
  edges: Array<ChatGroupEdge>;
}

export interface ChatGroupEdge {
   __typename?: 'ChatGroupEdge';
  cursor: Scalars['UUID'];
  node: ChatGroup;
}

export enum ChatGroupType {
  Note = 'NOTE',
  Individual = 'INDIVIDUAL'
}

export interface ChatMessage {
   __typename?: 'ChatMessage';
  id: Scalars['UUID'];
  author: User;
  markdown: Scalars['String'];
  authorVisibility: AuthorVisibility;
  createdAt: Scalars['Time'];
  updatedAt: Scalars['Time'];
  reactionSummaries: Array<ReactionSummary>;
  chatGroup: ChatGroup;
}


export interface ChatMessageReactionSummariesArgs {
  size?: Maybe<Scalars['Int']>;
}

export interface ChatMessageConnection {
   __typename?: 'ChatMessageConnection';
  totalCount: Scalars['Int'];
  pageInfo: PageInfo;
  edges: Array<ChatMessageEdge>;
}

export interface ChatMessageEdge {
   __typename?: 'ChatMessageEdge';
  cursor: Scalars['UUID'];
  node: ChatMessage;
}

export interface CreateNote {
  title: Maybe<Scalars['String']>;
  markdown: Maybe<Scalars['String']>;
  parentNoteID: Maybe<Scalars['UUID']>;
  tags: Array<Maybe<Scalars['String']>>;
  noteVisibility: Maybe<NoteVisibility>;
  authorVisibility: Maybe<AuthorVisibility>;
  notifyUsers: Array<Maybe<Scalars['String']>>;
  allowReadersToSuggestTags: Maybe<Scalars['Boolean']>;
}

export interface CreateNoteBackup {
  noteID: Scalars['UUID'];
  name: Scalars['String'];
  title: Scalars['String'];
  markdown: Scalars['String'];
}

export interface Cursor {
  line: Scalars['Int'];
  ch: Scalars['Int'];
}

export interface DeleteNote {
  noteID: Scalars['UUID'];
}

export interface DeleteNoteBackup {
  id: Scalars['UUID'];
}

export interface DeleteNotification {
  notificationID: Scalars['UUID'];
}

export interface DisableNoteKey {
  noteID: Scalars['UUID'];
  permission: NoteKeyPermission;
}

export interface DuplicateNote {
  noteID: Scalars['UUID'];
}

export interface EnableNoteKey {
  noteID: Scalars['UUID'];
  permission: NoteKeyPermission;
}

export interface FavoriteTag {
   __typename?: 'FavoriteTag';
  name: Scalars['String'];
  fullName: Scalars['String'];
  pinned: Scalars['Boolean'];
  order: Scalars['Int'];
}

export interface FollowTag {
  tag: Scalars['String'];
  pinned: Maybe<Scalars['Boolean']>;
}

export interface FollowUser {
  userID: Scalars['UUID'];
}

export interface GitHubUser {
   __typename?: 'GitHubUser';
  login: Scalars['String'];
  avatar: Scalars['String'];
  email: Scalars['String'];
}

export interface LinkWithGitHubAccount {
  code: Scalars['String'];
}

export interface Modification {
  v: Scalars['Int'];
  us: Array<Scalars['String']>;
  rs: Array<ModificationRecord>;
}

export interface ModificationRecord {
  o: Scalars['Int'];
  v: Scalars['String'];
}

export interface Mutation {
   __typename?: 'Mutation';
  signUp: AuthReturn;
  signIn: AuthReturn;
  signUpWithGitHubAccount: AuthReturn;
  signInWithGitHubAccount: AuthReturn;
  postChatMessage: ChatMessage;
  updateChatMessage: ChatMessage;
  addReactionToChatMessage: Scalars['Boolean'];
  removeReactionFromChatMessage: Scalars['Boolean'];
  subscribeToChatGroup: Scalars['Boolean'];
  unsubscribeFromChatGroup: Scalars['Boolean'];
  createNote: Maybe<Note>;
  duplicateNote: Maybe<Note>;
  attachToParentNote: Note;
  unattachFromParentNote: Scalars['Boolean'];
  bookmarkNote: Scalars['Boolean'];
  unbookmarkNote: Scalars['Boolean'];
  updateNoteMarkdown: Scalars['Boolean'];
  addTagToNote: Scalars['Boolean'];
  removeTagFromNote: Scalars['Boolean'];
  suggestNoteTag: Scalars['Boolean'];
  addCollaboratorToNote: User;
  removeCollaboratorFromNote: User;
  createNoteBackup: NoteBackup;
  deleteNoteBackup: Scalars['Boolean'];
  setCollaboratorRole: Scalars['Boolean'];
  addReactionToNote: Scalars['Boolean'];
  removeReactionFromNote: Scalars['Boolean'];
  setNoteVisibility: Scalars['Boolean'];
  setAuthorVisibility: Scalars['Boolean'];
  setAllowReadersToSuggestTags: Scalars['Boolean'];
  setAllowReadersToAttachNotes: Scalars['Boolean'];
  setInheritParentNoteCollaboratorsList: Scalars['Boolean'];
  deleteNote: Scalars['Boolean'];
  undeleteNote: Scalars['Boolean'];
  pinNote: Scalars['Boolean'];
  unpinNote: Scalars['Boolean'];
  archiveNote: Scalars['Boolean'];
  unarchiveNote: Scalars['Boolean'];
  reportNote: Scalars['Boolean'];
  unreportNote: Scalars['Boolean'];
  reorderNote: Scalars['Boolean'];
  deleteNotification: Scalars['Boolean'];
  deleteAllNotifications: Scalars['Boolean'];
  setUserInfo: User;
  followUser: Scalars['Boolean'];
  unfollowUser: Scalars['Boolean'];
  followTag: Scalars['Boolean'];
  unfollowTag: Scalars['Boolean'];
  setFollowingTagPinnedStatus: Scalars['Boolean'];
  userMadeChangesToNote: Scalars['Boolean'];
  userOperateEditorCursor: Scalars['Boolean'];
  sendEmailVerificationCode: Scalars['Boolean'];
  resetPassword: Scalars['Boolean'];
  verifyEmail: Scalars['Boolean'];
  enableNoteKey: NoteKey;
  disableNoteKey: NoteKey;
  linkWithGitHubAccount: Scalars['Boolean'];
  unlinkGitHubAccount: Scalars['Boolean'];
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


export interface MutationPostChatMessageArgs {
  input: PostChatMessage;
}


export interface MutationUpdateChatMessageArgs {
  input: UpdateChatMessage;
}


export interface MutationAddReactionToChatMessageArgs {
  input: AddReactionToChatMessage;
}


export interface MutationRemoveReactionFromChatMessageArgs {
  input: RemoveReactionFromChatMessage;
}


export interface MutationSubscribeToChatGroupArgs {
  input: SubscribeToChatGroup;
}


export interface MutationUnsubscribeFromChatGroupArgs {
  input: UnsubscribeFromChatGroup;
}


export interface MutationCreateNoteArgs {
  input: CreateNote;
}


export interface MutationDuplicateNoteArgs {
  input: DuplicateNote;
}


export interface MutationAttachToParentNoteArgs {
  input: Maybe<AttachToParentNote>;
}


export interface MutationUnattachFromParentNoteArgs {
  input: Maybe<UnattachFromParentNote>;
}


export interface MutationBookmarkNoteArgs {
  input: BookmarkNote;
}


export interface MutationUnbookmarkNoteArgs {
  input: UnbookmarkNote;
}


export interface MutationUpdateNoteMarkdownArgs {
  input: UpdateNoteMarkdown;
}


export interface MutationAddTagToNoteArgs {
  input: AddTagToNote;
}


export interface MutationRemoveTagFromNoteArgs {
  input: RemoveTagFromNote;
}


export interface MutationSuggestNoteTagArgs {
  input: SuggestNoteTag;
}


export interface MutationAddCollaboratorToNoteArgs {
  input: AddCollaboratorToNote;
}


export interface MutationRemoveCollaboratorFromNoteArgs {
  input: RemoveCollaboratorFromNote;
}


export interface MutationCreateNoteBackupArgs {
  input: Maybe<CreateNoteBackup>;
}


export interface MutationDeleteNoteBackupArgs {
  input: Maybe<DeleteNoteBackup>;
}


export interface MutationSetCollaboratorRoleArgs {
  input: SetCollaboratorRole;
}


export interface MutationAddReactionToNoteArgs {
  input: AddReactionToNote;
}


export interface MutationRemoveReactionFromNoteArgs {
  input: RemoveReactionFromNote;
}


export interface MutationSetNoteVisibilityArgs {
  input: SetNoteVisibility;
}


export interface MutationSetAuthorVisibilityArgs {
  input: SetAuthorVisibility;
}


export interface MutationSetAllowReadersToSuggestTagsArgs {
  input: Maybe<SetAllowReadersToSuggestTags>;
}


export interface MutationSetAllowReadersToAttachNotesArgs {
  input: Maybe<SetAllowReadersToAttachNotes>;
}


export interface MutationSetInheritParentNoteCollaboratorsListArgs {
  input: Maybe<SetInheritParentNoteCollaboratorsList>;
}


export interface MutationDeleteNoteArgs {
  input: DeleteNote;
}


export interface MutationUndeleteNoteArgs {
  input: UndeleteNote;
}


export interface MutationPinNoteArgs {
  input: PinNote;
}


export interface MutationUnpinNoteArgs {
  input: UnpinNote;
}


export interface MutationArchiveNoteArgs {
  input: ArchiveNote;
}


export interface MutationUnarchiveNoteArgs {
  input: UnarchiveNote;
}


export interface MutationReportNoteArgs {
  input: ReportNote;
}


export interface MutationUnreportNoteArgs {
  input: UnreportNote;
}


export interface MutationReorderNoteArgs {
  input: ReorderNote;
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


export interface MutationFollowTagArgs {
  input: FollowTag;
}


export interface MutationUnfollowTagArgs {
  input: UnfollowTag;
}


export interface MutationSetFollowingTagPinnedStatusArgs {
  input: Maybe<SetFollowingTagPinnedStatus>;
}


export interface MutationUserMadeChangesToNoteArgs {
  input: UserMadeChangesToNote;
}


export interface MutationUserOperateEditorCursorArgs {
  input: UserOperateEditorCursor;
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


export interface MutationEnableNoteKeyArgs {
  input: Maybe<EnableNoteKey>;
}


export interface MutationDisableNoteKeyArgs {
  input: Maybe<DisableNoteKey>;
}


export interface MutationLinkWithGitHubAccountArgs {
  input: Maybe<LinkWithGitHubAccount>;
}

export interface Note {
   __typename?: 'Note';
  id: Scalars['UUID'];
  createdAt: Scalars['Time'];
  updatedAt: Scalars['Time'];
  deletedAt: Maybe<Scalars['Time']>;
  modifiedAt: Scalars['Time'];
  publishedAt: Maybe<Scalars['Time']>;
  author: User;
  title: Scalars['String'];
  markdown: Scalars['String'];
  status: NoteStatus;
  order: Scalars['Int'];
  reactionsCount: Scalars['Int'];
  reportsCount: Scalars['Int'];
  bookmarksCount: Maybe<Scalars['Int']>;
  backupsCount: Maybe<Scalars['Int']>;
  attachedNotesCount: Maybe<Scalars['Int']>;
  clicksCount: Maybe<Scalars['Int']>;
  noteVisibility: NoteVisibility;
  authorVisibility: AuthorVisibility;
  reactionSummaries: Array<ReactionSummary>;
  tags: Array<NoteTag>;
  allowReadersToSuggestTags: Scalars['Boolean'];
  allowReadersToAttachNotes: Scalars['Boolean'];
  inheritParentNoteCollaboratorsList: Scalars['Boolean'];
  chatGroup: ChatGroup;
  collaborators: Array<NoteCollaborator>;
  collaboratorRole: NoteCollaboratorRole;
  backups: Array<NoteBackup>;
  noteKey: NoteKey;
  canAttachNote: Maybe<Scalars['Boolean']>;
  attachedNotes: NoteConnection;
  parentNote: Maybe<Note>;
  isBookmarked: Maybe<Scalars['Boolean']>;
}


export interface NoteReactionSummariesArgs {
  size?: Maybe<Scalars['Int']>;
}


export interface NoteChatGroupArgs {
  type: NoteChatGroupType;
}


export interface NoteNoteKeyArgs {
  permission: NoteKeyPermission;
}


export interface NoteAttachedNotesArgs {
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}

export interface NoteBackup {
   __typename?: 'NoteBackup';
  id: Scalars['UUID'];
  createdAt: Scalars['Time'];
  updatedAt: Scalars['Time'];
  user: User;
  name: Scalars['String'];
  title: Scalars['String'];
  markdown: Scalars['String'];
}

export enum NoteChatGroupType {
  Editor = 'EDITOR',
  Preview = 'PREVIEW'
}

export interface NoteCollaborator {
   __typename?: 'NoteCollaborator';
  noteID: Scalars['UUID'];
  role: NoteCollaboratorRole;
  user: User;
}

export enum NoteCollaboratorRole {
  Admin = 'ADMIN',
  Editor = 'EDITOR',
  Viewer = 'VIEWER',
  Unknown = 'UNKNOWN'
}

export interface NoteConnection {
   __typename?: 'NoteConnection';
  totalCount: Scalars['Int'];
  pageInfo: PageInfo;
  edges: Array<NoteEdge>;
}

export interface NoteEdge {
   __typename?: 'NoteEdge';
  cursor: Scalars['UUID'];
  node: Note;
}

export interface NoteKey {
   __typename?: 'NoteKey';
  id: Scalars['UUID'];
  createdAt: Scalars['Time'];
  permission: NoteKeyPermission;
  disabled: Scalars['Boolean'];
}

export enum NoteKeyPermission {
  CanEdit = 'CAN_EDIT',
  CanView = 'CAN_VIEW'
}

export enum NoteOrderBy {
  CreatedAt = 'CREATED_AT',
  ModifiedAt = 'MODIFIED_AT',
  InteractedAt = 'INTERACTED_AT'
}

export interface NoteReaction {
   __typename?: 'NoteReaction';
  note: Note;
  user: User;
  reaction: Scalars['String'];
}

export enum NoteStatus {
  Normal = 'NORMAL',
  Pinned = 'PINNED',
  Archived = 'ARCHIVED',
  Deleted = 'DELETED'
}

export interface NoteTag {
   __typename?: 'NoteTag';
  name: Scalars['String'];
  fullName: Scalars['String'];
}

export enum NoteVisibility {
  Public = 'PUBLIC',
  Private = 'PRIVATE',
  FriendsOnly = 'FRIENDS_ONLY'
}

export interface Notification {
   __typename?: 'Notification';
  id: Scalars['UUID'];
  createdAt: Scalars['Time'];
  event: NotificationEvent;
  meta: Scalars['String'];
  receiver: User;
  origin: User;
}

export interface NotificationConnection {
   __typename?: 'NotificationConnection';
  totalCount: Scalars['Int'];
  pageInfo: PageInfo;
  edges: Array<NotificationEdge>;
}

export interface NotificationEdge {
   __typename?: 'NotificationEdge';
  cursor: Scalars['UUID'];
  node: Notification;
}

export interface NotificationEvent {
  type: NotificationEventType;
}

export interface NotificationEventBookmark  extends NotificationEvent {
   __typename?: 'NotificationEventBookmark';
  type: NotificationEventType;
  note: Note;
}

export interface NotificationEventCommentPosting  extends NotificationEvent {
   __typename?: 'NotificationEventCommentPosting';
  type: NotificationEventType;
  comment: ChatMessage;
}

export interface NotificationEventNotePosting  extends NotificationEvent {
   __typename?: 'NotificationEventNotePosting';
  type: NotificationEventType;
  note: Note;
}

export interface NotificationEventNoteReaction  extends NotificationEvent {
   __typename?: 'NotificationEventNoteReaction';
  type: NotificationEventType;
  noteReaction: NoteReaction;
}

export interface NotificationEventNoteSharing  extends NotificationEvent {
   __typename?: 'NotificationEventNoteSharing';
  type: NotificationEventType;
  note: Note;
  role: NoteCollaboratorRole;
}

export interface NotificationEventNoteTagSuggestion  extends NotificationEvent {
   __typename?: 'NotificationEventNoteTagSuggestion';
  type: NotificationEventType;
  note: Note;
}

export enum NotificationEventType {
  NotePosting = 'NOTE_POSTING',
  NoteReaction = 'NOTE_REACTION',
  UserFollowing = 'USER_FOLLOWING',
  CommentPosting = 'COMMENT_POSTING',
  NoteSharing = 'NOTE_SHARING',
  NoteTagSuggestion = 'NOTE_TAG_SUGGESTION',
  Bookmark = 'BOOKMARK'
}

export interface NotificationEventUserFollowing  extends NotificationEvent {
   __typename?: 'NotificationEventUserFollowing';
  type: NotificationEventType;
}

export interface PageInfo {
   __typename?: 'PageInfo';
  startCursor: Scalars['UUID'];
  endCursor: Scalars['UUID'];
  hasPreviousPage: Scalars['Boolean'];
  hasNextPage: Scalars['Boolean'];
}

export interface PinNote {
  noteID: Scalars['UUID'];
}

export interface PostChatMessage {
  chatGroupID: Scalars['UUID'];
  markdown: Scalars['String'];
  authorVisibility: Maybe<AuthorVisibility>;
  notifyUsers: Array<Maybe<Scalars['String']>>;
}

export interface Query {
   __typename?: 'Query';
  test: Scalars['String'];
  chatGroup: ChatGroup;
  note: Note;
  publicNotes: NoteConnection;
  tag: Tag;
  viewer: User;
  user: User;
  stats: Stats;
}


export interface QueryChatGroupArgs {
  id: Scalars['UUID'];
}


export interface QueryNoteArgs {
  id: Scalars['UUID'];
  noteKey: Maybe<Scalars['UUID']>;
  increaseClicksCountIfNecessary?: Maybe<Scalars['Boolean']>;
}


export interface QueryPublicNotesArgs {
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
  tag?: Maybe<Scalars['String']>;
  authorVisibility?: Maybe<AuthorViewScope>;
}


export interface QueryTagArgs {
  name: Scalars['String'];
}


export interface QueryUserArgs {
  id?: Maybe<Scalars['UUID']>;
  username?: Maybe<Scalars['String']>;
}

export interface ReactionSummary {
   __typename?: 'ReactionSummary';
  count: Scalars['Int'];
  reaction: Scalars['String'];
  selfAuthored: Scalars['Boolean'];
}

export interface RemoveCollaboratorFromNote {
  noteID: Scalars['UUID'];
  collaboratorID: Maybe<Scalars['UUID']>;
  collaboratorUsername: Maybe<Scalars['String']>;
}

export interface RemoveReactionFromChatMessage {
  chatMessageID: Scalars['UUID'];
  reaction: Scalars['String'];
}

export interface RemoveReactionFromNote {
  noteID: Scalars['UUID'];
  reaction: Scalars['String'];
}

export interface RemoveTagFromNote {
  noteID: Scalars['UUID'];
  noteKey: Maybe<Scalars['UUID']>;
  tag: Scalars['String'];
}

export interface ReorderNote {
  noteID: Scalars['UUID'];
  order: Scalars['Int'];
}

export interface ReportNote {
  noteID: Scalars['UUID'];
}

export interface ResetPassword {
  email: Scalars['String'];
  verificationCode: Scalars['String'];
  password: Scalars['String'];
}

export interface SendEmailVerificationCode {
  email: Scalars['String'];
}

export interface SetAllowReadersToAttachNotes {
  noteID: Scalars['UUID'];
  allowReadersToAttachNotes: Scalars['Boolean'];
}

export interface SetAllowReadersToSuggestTags {
  noteID: Scalars['UUID'];
  allowReadersToSuggestTags: Scalars['Boolean'];
}

export interface SetAuthorVisibility {
  noteID: Scalars['UUID'];
  visibility: AuthorVisibility;
}

export interface SetCollaboratorRole {
  noteID: Scalars['UUID'];
  collaboratorID: Scalars['UUID'];
  role: NoteCollaboratorRole;
}

export interface SetFollowingTagPinnedStatus {
  tag: Scalars['String'];
  pinned: Scalars['Boolean'];
}

export interface SetInheritParentNoteCollaboratorsList {
  noteID: Scalars['UUID'];
  inheritParentNoteCollaboratorsList: Scalars['Boolean'];
}

export interface SetNoteVisibility {
  noteID: Scalars['UUID'];
  visibility: NoteVisibility;
}

export interface SetUserInfo {
  name: Scalars['String'];
  avatar: Scalars['String'];
  cover: Scalars['String'];
  bio: Scalars['String'];
  location: Scalars['String'];
  language: Scalars['String'];
  editorCursorColor: Scalars['String'];
}

export interface SignInInput {
  email: Scalars['String'];
  password: Scalars['String'];
}

export interface SignInWithGitHubAccount {
  code: Scalars['String'];
}

export interface SignUpInput {
  username: Scalars['String'];
  email: Scalars['String'];
  password: Scalars['String'];
}

export interface SignUpWithGitHubAccount {
  username: Scalars['String'];
  email: Scalars['String'];
  accessToken: Scalars['String'];
}

export interface Stats {
   __typename?: 'Stats';
  numUsers: Scalars['Int'];
  numNotes: Scalars['Int'];
  numChatMessages: Scalars['Int'];
  numNoteReactions: Scalars['Int'];
}

export interface SubscribeToChatGroup {
  chatGroupID: Scalars['UUID'];
}

export interface Subscription {
   __typename?: 'Subscription';
  userGetsOnline: UserInteraction;
  messagePostedInChatGroup: ChatMessage;
  userJoinedNoteEditor: UserEditorInteraction;
}


export interface SubscriptionMessagePostedInChatGroupArgs {
  chatGroupID: Scalars['UUID'];
}


export interface SubscriptionUserJoinedNoteEditorArgs {
  noteID: Scalars['UUID'];
  noteKey?: Maybe<Scalars['UUID']>;
  clientID: Scalars['UUID'];
}

export interface SuggestNoteTag {
  noteID: Scalars['UUID'];
  tag: Scalars['String'];
}

export interface Tag {
   __typename?: 'Tag';
  name: Scalars['String'];
  fullName: Scalars['String'];
  isFollowing: Scalars['Boolean'];
  pinned: Scalars['Boolean'];
}


export interface UnarchiveNote {
  noteID: Scalars['UUID'];
}

export interface UnattachFromParentNote {
  noteID: Scalars['UUID'];
  parentNoteID: Scalars['UUID'];
}

export interface UnbookmarkNote {
  noteID: Scalars['UUID'];
}

export interface UndeleteNote {
  noteID: Scalars['UUID'];
}

export interface UnfollowTag {
  tag: Scalars['String'];
}

export interface UnfollowUser {
  userID: Scalars['UUID'];
}

export interface UnpinNote {
  noteID: Scalars['UUID'];
}

export interface UnreportNote {
  noteID: Scalars['UUID'];
}

export interface UnsubscribeFromChatGroup {
  chatGroupID: Scalars['UUID'];
}

export interface UpdateChatMessage {
  chatMessageID: Scalars['UUID'];
  markdown: Scalars['String'];
}

export interface UpdateNoteMarkdown {
  noteID: Scalars['UUID'];
  noteKey: Maybe<Scalars['UUID']>;
  title: Scalars['String'];
  modification: Modification;
}


export interface User {
   __typename?: 'User';
  id: Scalars['UUID'];
  name: Maybe<Scalars['String']>;
  username: Maybe<Scalars['String']>;
  email: Maybe<Scalars['String']>;
  verifiedEmail: Maybe<Scalars['String']>;
  avatar: Maybe<Scalars['String']>;
  cover: Maybe<Scalars['String']>;
  bio: Maybe<Scalars['String']>;
  location: Maybe<Scalars['String']>;
  language: Maybe<Scalars['String']>;
  createdAt: Maybe<Scalars['Time']>;
  updatedAt: Maybe<Scalars['Time']>;
  deletedAt: Maybe<Scalars['Time']>;
  followingsCount: Maybe<Scalars['Int']>;
  followersCount: Maybe<Scalars['Int']>;
  notesCount: Maybe<Scalars['Int']>;
  isFollowing: Maybe<Scalars['Boolean']>;
  areFriends: Maybe<Scalars['Boolean']>;
  followings: Maybe<Array<User>>;
  followers: Maybe<Array<User>>;
  favoriteTags: Maybe<Array<FavoriteTag>>;
  notes: NoteConnection;
  followingsNotes: NoteConnection;
  sharedNotes: NoteConnection;
  bookmarks: NoteConnection;
  notifications: NotificationConnection;
  clientID: Maybe<Scalars['String']>;
  editorActorID: Maybe<Scalars['String']>;
  editorCursorColor: Maybe<Scalars['String']>;
  chatGroups: ChatGroupConnection;
  githubUser: Maybe<GitHubUser>;
}


export interface UserNotesArgs {
  tag?: Maybe<Scalars['String']>;
  statuses: Array<NoteStatus>;
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}


export interface UserFollowingsNotesArgs {
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}


export interface UserSharedNotesArgs {
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}


export interface UserBookmarksArgs {
  tag?: Maybe<Scalars['String']>;
  orderBy: NoteOrderBy;
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}


export interface UserNotificationsArgs {
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}


export interface UserChatGroupsArgs {
  before?: Maybe<Scalars['UUID']>;
  after?: Maybe<Scalars['UUID']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
}

export interface UserEditorInteraction {
   __typename?: 'UserEditorInteraction';
  operation: UserEditorOperation;
  value: Scalars['String'];
}

export enum UserEditorOperation {
  Joined = 'JOINED',
  Left = 'LEFT',
  MadeChanges = 'MADE_CHANGES',
  Initiated = 'INITIATED',
  CursorMoved = 'CURSOR_MOVED'
}

export interface UserInteraction {
   __typename?: 'UserInteraction';
  operation: UserOperation;
  value: Scalars['String'];
}

export interface UserMadeChangesToNote {
  noteID: Scalars['UUID'];
  editorActorID: Scalars['String'];
  changes: Scalars['String'];
}

export interface UserOperateEditorCursor {
  noteID: Scalars['UUID'];
  editorActorID: Scalars['String'];
  cursors: Array<Cursor>;
}

export enum UserOperation {
  ReceivedNotification = 'RECEIVED_NOTIFICATION'
}


export interface VerifyEmail {
  email: Scalars['String'];
  verificationCode: Scalars['String'];
}

export type SignUpMutationVariables = {
  username: Scalars['String'];
  email: Scalars['String'];
  password: Scalars['String'];
};


export type SignUpMutation = (
  { __typename?: 'Mutation' }
  & { signUp: (
    { __typename?: 'AuthReturn' }
    & Pick<AuthReturn, 'token'>
    & { user: (
      { __typename?: 'User' }
      & Pick<User, 'id'>
    ) }
  ) }
);

export type SignInMutationVariables = {
  email: Scalars['String'];
  password: Scalars['String'];
};


export type SignInMutation = (
  { __typename?: 'Mutation' }
  & { signIn: (
    { __typename?: 'AuthReturn' }
    & Pick<AuthReturn, 'token'>
    & { user: (
      { __typename?: 'User' }
      & Pick<User, 'id'>
    ) }
  ) }
);

export type SignUpWithGitHubAccountMutationVariables = {
  username: Scalars['String'];
  email: Scalars['String'];
  accessToken: Scalars['String'];
};


export type SignUpWithGitHubAccountMutation = (
  { __typename?: 'Mutation' }
  & { signUpWithGitHubAccount: (
    { __typename?: 'AuthReturn' }
    & Pick<AuthReturn, 'token'>
    & { user: (
      { __typename?: 'User' }
      & Pick<User, 'id'>
    ) }
  ) }
);

export type SignInWithGitHubAccountMutationVariables = {
  code: Scalars['String'];
};


export type SignInWithGitHubAccountMutation = (
  { __typename?: 'Mutation' }
  & { signInWithGitHubAccount: (
    { __typename?: 'AuthReturn' }
    & Pick<AuthReturn, 'token'>
    & { user: (
      { __typename?: 'User' }
      & Pick<User, 'id' | 'username' | 'email'>
    ) }
  ) }
);

export type SendEmailVerificationCodeMutationVariables = {
  email: Scalars['String'];
};


export type SendEmailVerificationCodeMutation = (
  { __typename?: 'Mutation' }
  & Pick<Mutation, 'sendEmailVerificationCode'>
);

export type ResetPasswordMutationVariables = {
  email: Scalars['String'];
  verificationCode: Scalars['String'];
  password: Scalars['String'];
};


export type ResetPasswordMutation = (
  { __typename?: 'Mutation' }
  & Pick<Mutation, 'resetPassword'>
);

export type VerifyEmailMutationVariables = {
  email: Scalars['String'];
  verificationCode: Scalars['String'];
};


export type VerifyEmailMutation = (
  { __typename?: 'Mutation' }
  & Pick<Mutation, 'verifyEmail'>
);

export type LinkWithGitHubAccountMutationVariables = {
  code: Scalars['String'];
};


export type LinkWithGitHubAccountMutation = (
  { __typename?: 'Mutation' }
  & Pick<Mutation, 'linkWithGitHubAccount'>
);

export type UnlinkGitHubAccountMutationVariables = {};


export type UnlinkGitHubAccountMutation = (
  { __typename?: 'Mutation' }
  & Pick<Mutation, 'unlinkGitHubAccount'>
);

export type SetUserInfoMutationVariables = {
  cover: Scalars['String'];
  bio: Scalars['String'];
  location: Scalars['String'];
  language: Scalars['String'];
  name: Scalars['String'];
  avatar: Scalars['String'];
  editorCursorColor: Scalars['String'];
};


export type SetUserInfoMutation = (
  { __typename?: 'Mutation' }
  & { setUserInfo: (
    { __typename?: 'User' }
    & ViewerFieldsFragment
  ) }
);

export type GitHubUserQueryVariables = {};


export type GitHubUserQuery = (
  { __typename?: 'Query' }
  & { viewer: (
    { __typename?: 'User' }
    & { githubUser: Maybe<(
      { __typename?: 'GitHubUser' }
      & Pick<GitHubUser, 'login' | 'avatar' | 'email'>
    )> }
  ) }
);

export type ViewerFieldsFragment = (
  { __typename?: 'User' }
  & Pick<User, 'avatar' | 'bio' | 'cover' | 'createdAt' | 'deletedAt' | 'id' | 'language' | 'name' | 'username' | 'email' | 'verifiedEmail' | 'updatedAt' | 'editorCursorColor'>
  & { notifications: (
    { __typename?: 'NotificationConnection' }
    & Pick<NotificationConnection, 'totalCount'>
  ) }
);

export type ViewerQueryVariables = {};


export type ViewerQuery = (
  { __typename?: 'Query' }
  & { viewer: (
    { __typename?: 'User' }
    & ViewerFieldsFragment
  ) }
);

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
  notifications(last: 1) {
    totalCount
  }
  editorCursorColor
}
    `;
export const SignUpDocument = gql`
    mutation SignUp($username: String!, $email: String!, $password: String!) {
  signUp(input: {username: $username, email: $email, password: $password}) {
    token
    user {
      id
    }
  }
}
    `;

export const SignUpComponent = (props: Omit<Urql.MutationProps<SignUpMutation, SignUpMutationVariables>, 'query'> & { variables?: SignUpMutationVariables }) => (
  <Urql.Mutation {...props} query={SignUpDocument} />
);


export function useSignUpMutation() {
  return Urql.useMutation<SignUpMutation, SignUpMutationVariables>(SignUpDocument);
};
export const SignInDocument = gql`
    mutation SignIn($email: String!, $password: String!) {
  signIn(input: {email: $email, password: $password}) {
    token
    user {
      id
    }
  }
}
    `;

export const SignInComponent = (props: Omit<Urql.MutationProps<SignInMutation, SignInMutationVariables>, 'query'> & { variables?: SignInMutationVariables }) => (
  <Urql.Mutation {...props} query={SignInDocument} />
);


export function useSignInMutation() {
  return Urql.useMutation<SignInMutation, SignInMutationVariables>(SignInDocument);
};
export const SignUpWithGitHubAccountDocument = gql`
    mutation SignUpWithGitHubAccount($username: String!, $email: String!, $accessToken: String!) {
  signUpWithGitHubAccount(input: {username: $username, email: $email, accessToken: $accessToken}) {
    token
    user {
      id
    }
  }
}
    `;

export const SignUpWithGitHubAccountComponent = (props: Omit<Urql.MutationProps<SignUpWithGitHubAccountMutation, SignUpWithGitHubAccountMutationVariables>, 'query'> & { variables?: SignUpWithGitHubAccountMutationVariables }) => (
  <Urql.Mutation {...props} query={SignUpWithGitHubAccountDocument} />
);


export function useSignUpWithGitHubAccountMutation() {
  return Urql.useMutation<SignUpWithGitHubAccountMutation, SignUpWithGitHubAccountMutationVariables>(SignUpWithGitHubAccountDocument);
};
export const SignInWithGitHubAccountDocument = gql`
    mutation SignInWithGitHubAccount($code: String!) {
  signInWithGitHubAccount(input: {code: $code}) {
    token
    user {
      id
      username
      email
    }
  }
}
    `;

export const SignInWithGitHubAccountComponent = (props: Omit<Urql.MutationProps<SignInWithGitHubAccountMutation, SignInWithGitHubAccountMutationVariables>, 'query'> & { variables?: SignInWithGitHubAccountMutationVariables }) => (
  <Urql.Mutation {...props} query={SignInWithGitHubAccountDocument} />
);


export function useSignInWithGitHubAccountMutation() {
  return Urql.useMutation<SignInWithGitHubAccountMutation, SignInWithGitHubAccountMutationVariables>(SignInWithGitHubAccountDocument);
};
export const SendEmailVerificationCodeDocument = gql`
    mutation SendEmailVerificationCode($email: String!) {
  sendEmailVerificationCode(input: {email: $email})
}
    `;

export const SendEmailVerificationCodeComponent = (props: Omit<Urql.MutationProps<SendEmailVerificationCodeMutation, SendEmailVerificationCodeMutationVariables>, 'query'> & { variables?: SendEmailVerificationCodeMutationVariables }) => (
  <Urql.Mutation {...props} query={SendEmailVerificationCodeDocument} />
);


export function useSendEmailVerificationCodeMutation() {
  return Urql.useMutation<SendEmailVerificationCodeMutation, SendEmailVerificationCodeMutationVariables>(SendEmailVerificationCodeDocument);
};
export const ResetPasswordDocument = gql`
    mutation ResetPassword($email: String!, $verificationCode: String!, $password: String!) {
  resetPassword(input: {email: $email, verificationCode: $verificationCode, password: $password})
}
    `;

export const ResetPasswordComponent = (props: Omit<Urql.MutationProps<ResetPasswordMutation, ResetPasswordMutationVariables>, 'query'> & { variables?: ResetPasswordMutationVariables }) => (
  <Urql.Mutation {...props} query={ResetPasswordDocument} />
);


export function useResetPasswordMutation() {
  return Urql.useMutation<ResetPasswordMutation, ResetPasswordMutationVariables>(ResetPasswordDocument);
};
export const VerifyEmailDocument = gql`
    mutation VerifyEmail($email: String!, $verificationCode: String!) {
  verifyEmail(input: {email: $email, verificationCode: $verificationCode})
}
    `;

export const VerifyEmailComponent = (props: Omit<Urql.MutationProps<VerifyEmailMutation, VerifyEmailMutationVariables>, 'query'> & { variables?: VerifyEmailMutationVariables }) => (
  <Urql.Mutation {...props} query={VerifyEmailDocument} />
);


export function useVerifyEmailMutation() {
  return Urql.useMutation<VerifyEmailMutation, VerifyEmailMutationVariables>(VerifyEmailDocument);
};
export const LinkWithGitHubAccountDocument = gql`
    mutation LinkWithGitHubAccount($code: String!) {
  linkWithGitHubAccount(input: {code: $code})
}
    `;

export const LinkWithGitHubAccountComponent = (props: Omit<Urql.MutationProps<LinkWithGitHubAccountMutation, LinkWithGitHubAccountMutationVariables>, 'query'> & { variables?: LinkWithGitHubAccountMutationVariables }) => (
  <Urql.Mutation {...props} query={LinkWithGitHubAccountDocument} />
);


export function useLinkWithGitHubAccountMutation() {
  return Urql.useMutation<LinkWithGitHubAccountMutation, LinkWithGitHubAccountMutationVariables>(LinkWithGitHubAccountDocument);
};
export const UnlinkGitHubAccountDocument = gql`
    mutation UnlinkGitHubAccount {
  unlinkGitHubAccount
}
    `;

export const UnlinkGitHubAccountComponent = (props: Omit<Urql.MutationProps<UnlinkGitHubAccountMutation, UnlinkGitHubAccountMutationVariables>, 'query'> & { variables?: UnlinkGitHubAccountMutationVariables }) => (
  <Urql.Mutation {...props} query={UnlinkGitHubAccountDocument} />
);


export function useUnlinkGitHubAccountMutation() {
  return Urql.useMutation<UnlinkGitHubAccountMutation, UnlinkGitHubAccountMutationVariables>(UnlinkGitHubAccountDocument);
};
export const SetUserInfoDocument = gql`
    mutation SetUserInfo($cover: String!, $bio: String!, $location: String!, $language: String!, $name: String!, $avatar: String!, $editorCursorColor: String!) {
  setUserInfo(input: {cover: $cover, bio: $bio, location: $location, language: $language, name: $name, avatar: $avatar, editorCursorColor: $editorCursorColor}) {
    ...ViewerFields
  }
}
    ${ViewerFieldsFragmentDoc}`;

export const SetUserInfoComponent = (props: Omit<Urql.MutationProps<SetUserInfoMutation, SetUserInfoMutationVariables>, 'query'> & { variables?: SetUserInfoMutationVariables }) => (
  <Urql.Mutation {...props} query={SetUserInfoDocument} />
);


export function useSetUserInfoMutation() {
  return Urql.useMutation<SetUserInfoMutation, SetUserInfoMutationVariables>(SetUserInfoDocument);
};
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

export const GitHubUserComponent = (props: Omit<Urql.QueryProps<GitHubUserQuery, GitHubUserQueryVariables>, 'query'> & { variables?: GitHubUserQueryVariables }) => (
  <Urql.Query {...props} query={GitHubUserDocument} />
);


export function useGitHubUserQuery(options: Omit<Urql.UseQueryArgs<GitHubUserQueryVariables>, 'query'> = {}) {
  return Urql.useQuery<GitHubUserQuery>({ query: GitHubUserDocument, ...options });
};
export const ViewerDocument = gql`
    query Viewer {
  viewer {
    ...ViewerFields
  }
}
    ${ViewerFieldsFragmentDoc}`;

export const ViewerComponent = (props: Omit<Urql.QueryProps<ViewerQuery, ViewerQueryVariables>, 'query'> & { variables?: ViewerQueryVariables }) => (
  <Urql.Query {...props} query={ViewerDocument} />
);


export function useViewerQuery(options: Omit<Urql.UseQueryArgs<ViewerQueryVariables>, 'query'> = {}) {
  return Urql.useQuery<ViewerQuery>({ query: ViewerDocument, ...options });
};