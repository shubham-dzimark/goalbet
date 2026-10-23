'use client';

import { useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';
import { useErrorMessage } from './use-error-message';

/** Maps API errors onto form fields (VALIDATION_FAILED / EMAIL_TAKEN …) or a form-level message. */
export function useApiFormError<T extends FieldValues>(setError: UseFormSetError<T>) {
  const toMessage = useErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const handle = (err: unknown) => {
    setFormError(null);
    if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
      for (const [field, key] of Object.entries(err.fields)) setError(field as Path<T>, { message: key });
      if (err.code !== 'VALIDATION_FAILED') setFormError(toMessage(err));
      return;
    }
    setFormError(toMessage(err));
  };

  return { formError, setFormError, handle };
}
