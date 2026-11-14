import React from 'react';
import type { Language } from '../../core/i18n/translations';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import type { ScannedPage } from '../core/types';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { EnhanceConfirmationModals } from './EnhanceConfirmationModals';
import { EnhanceSettingsModals } from './EnhanceSettingsModals';

export interface EnhanceModalsProps {
  lang?: Language;
  pages: ScannedPage[];
  safeIndex: number;
  currentPage: ScannedPage;
  showCancelModal: boolean;
  setShowCancelModal: (open: boolean) => void;
  showDeletePageModal: boolean;
  setShowDeletePageModal: (open: boolean) => void;
  showMoreActions: boolean;
  setShowMoreActions: (open: boolean) => void;
  isSignatureOpen: boolean;
  setIsSignatureOpen: (open: boolean) => void;
  isWatermarkOpen: boolean;
  setIsWatermarkOpen: (open: boolean) => void;
  isAdvancedOptionsOpen: boolean;
  setIsAdvancedOptionsOpen: (open: boolean) => void;
  isOcrModalOpen: boolean;
  setIsOcrModalOpen: (open: boolean) => void;
  watermarkText: string;
  setWatermarkText: (text: string) => void;
  watermarkStyle: PdfWatermarkStyle;
  setWatermarkStyle: (style: PdfWatermarkStyle) => void;
  compressionPreset: PdfCompressionPreset;
  setCompressionPreset: (preset: PdfCompressionPreset) => void;
  pageFormat: PdfPageFormat;
  setPageFormat: (fmt: PdfPageFormat) => void;
  enableOcr: boolean;
  setEnableOcr: (enabled: boolean) => void;
  curvature: number;
  setCurvature: (value: number) => void;
  spinePos: number;
  setSpinePos: (value: number) => void;
  suggestedDocTitle: string;
  extractedText: string;
  setDocTitle: (title: string) => void;
  setToastMsg: (msg: string) => void;
  setCurrentPageIndex: (idx: number) => void;
  setSignatures: React.Dispatch<React.SetStateAction<Record<string, SignaturePlacement>>>;
  onDeletePage: (index: number) => void;
  onResetAll: () => void;
  onSharePdf: () => void;
  onDownloadJpg: () => void;
  onOpenInReader: () => void;
  onPrintPdf: () => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceModals: React.FC<EnhanceModalsProps> = (props) => (
  <>
    <EnhanceConfirmationModals
      pages={props.pages}
      safeIndex={props.safeIndex}
      currentPage={props.currentPage}
      showCancelModal={props.showCancelModal}
      setShowCancelModal={props.setShowCancelModal}
      showDeletePageModal={props.showDeletePageModal}
      setShowDeletePageModal={props.setShowDeletePageModal}
      showMoreActions={props.showMoreActions}
      setShowMoreActions={props.setShowMoreActions}
      isSignatureOpen={props.isSignatureOpen}
      setIsSignatureOpen={props.setIsSignatureOpen}
      setToastMsg={props.setToastMsg}
      setCurrentPageIndex={props.setCurrentPageIndex}
      setSignatures={props.setSignatures}
      onDeletePage={props.onDeletePage}
      onResetAll={props.onResetAll}
      lang={props.lang}
      onSharePdf={props.onSharePdf}
      onDownloadJpg={props.onDownloadJpg}
      onOpenInReader={props.onOpenInReader}
      onWatermark={() => props.setIsWatermarkOpen(true)}
      onPdfOptions={() => props.setIsAdvancedOptionsOpen(true)}
      onPrintPdf={props.onPrintPdf}
      triggerHaptic={props.triggerHaptic}
    />
    <EnhanceSettingsModals
      lang={props.lang}
      safeIndex={props.safeIndex}
      isWatermarkOpen={props.isWatermarkOpen}
      setIsWatermarkOpen={props.setIsWatermarkOpen}
      isAdvancedOptionsOpen={props.isAdvancedOptionsOpen}
      setIsAdvancedOptionsOpen={props.setIsAdvancedOptionsOpen}
      isOcrModalOpen={props.isOcrModalOpen}
      setIsOcrModalOpen={props.setIsOcrModalOpen}
      setIsSignatureOpen={props.setIsSignatureOpen}
      watermarkText={props.watermarkText}
      setWatermarkText={props.setWatermarkText}
      watermarkStyle={props.watermarkStyle}
      setWatermarkStyle={props.setWatermarkStyle}
      compressionPreset={props.compressionPreset}
      setCompressionPreset={props.setCompressionPreset}
      pageFormat={props.pageFormat}
      setPageFormat={props.setPageFormat}
      enableOcr={props.enableOcr}
      setEnableOcr={props.setEnableOcr}
      curvature={props.curvature}
      setCurvature={props.setCurvature}
      spinePos={props.spinePos}
      setSpinePos={props.setSpinePos}
      suggestedDocTitle={props.suggestedDocTitle}
      extractedText={props.extractedText}
      setDocTitle={props.setDocTitle}
      setToastMsg={props.setToastMsg}
      triggerHaptic={props.triggerHaptic}
    />
  </>
);
