export type ProfileSource = "inline" | "user-directory" | "project-directory"

export type ProfileDescriptorError = {
  kind: "parse" | "shape"
  message: string
}

export type ProfileDescriptor = {
  name: string
  source: ProfileSource
  path?: string
  value?: unknown
  error?: ProfileDescriptorError
}

export type ProfileDescriptorMap = ReadonlyMap<string, ProfileDescriptor>
