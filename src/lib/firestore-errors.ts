import { auth } from "../firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export class DocumentIdMissingError extends Error {
  constructor(
    public collectionName: string,
    public op: OperationType,
  ) {
    super(
      `ID Missing Error: Cannot perform '${op}' on collection '${collectionName}' because the document ID was not found or is empty.`,
    );
    this.name = "DocumentIdMissingError";
  }
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  let errorMessage = error instanceof Error ? error.message : String(error);

  // Custom alert for browser rendering
  if (
    typeof window !== "undefined" &&
    error instanceof DocumentIdMissingError
  ) {
    if ((window as any).__showToast) {
      (window as any).__showToast(error.message, "error");
    } else {
      alert(error.message);
    }
  }

  if (errorMessage.toLowerCase().includes("quota")) {
    console.warn(
      `Firestore Quota Exceeded on ${operationType} to ${path}: ${errorMessage}`,
    );
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));

  if (typeof window !== "undefined") {
    if ((window as any).__showToast) {
      (window as any).__showToast(
        `Firestore Action Failed: ${operationType} on ${path}. Error: ${errorMessage}`,
        "error",
      );
    } else {
      alert(
        `Firestore Action Failed: ${operationType} on ${path}\nError: ${errorMessage}`,
      );
    }
  } else {
    throw new Error(JSON.stringify(errInfo));
  }
}
