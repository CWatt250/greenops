'use client';

import { forwardRef } from 'react';
import ReactSignatureCanvas from 'react-signature-canvas';
import type { default as SigCanvasType } from 'react-signature-canvas';

export type { SigCanvasType };

type Props = React.ComponentProps<typeof ReactSignatureCanvas>;

export const SignaturePad = forwardRef<SigCanvasType, Props>((props, ref) => (
  <ReactSignatureCanvas ref={ref} {...props} />
));
SignaturePad.displayName = 'SignaturePad';
