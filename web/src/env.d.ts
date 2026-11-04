interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_RPC_URL?: string;
  readonly PUBLIC_CHAIN_ID?: string;
  readonly PUBLIC_EXPLORER_URL?: string;
  readonly PUBLIC_REGISTRY_ADDRESS?: string;
  readonly PUBLIC_VAULT_ADDRESS?: string;
  readonly PUBLIC_DATASET_ADDRESS?: string;
  readonly PUBLIC_DATASET_SYMBOL?: string;
  readonly PUBLIC_START_BLOCK?: string;
  readonly PUBLIC_TASK_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
