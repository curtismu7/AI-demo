import React from 'react';
import DraggableModal from './DraggableModal';
import TokenChainDisplay from './TokenChainDisplay';

/**
 * Token Chain modal — draggable, resizable, pop-out.
 * Shows the RFC 8693 token exchange and authorization decisions from the agent.
 * Uses DraggableModal with closeOnPopout so pop-out dismisses the in-page modal
 * while the content continues in the separate window.
 *
 * credentialPath: each token-chain event carries a credentialPath field added in Phase 266.
 * TokenChainDisplay (rendered below) handles per-segment colour/badge rendering automatically.
 * No props change needed here — the field rides through TokenChainContext events unchanged.
 */
export default function TokenChainModal({ isOpen, onClose }) {
  return (
    <DraggableModal
      isOpen={isOpen}
      onClose={onClose}
      title="Token Chain"
      defaultWidth={700}
      defaultHeight={720}
      storageKey="ba-token-chain-modal"
      footer={null}
      closeOnPopout
      zIndex={10000}
    >
      <TokenChainDisplay hideHeader />
    </DraggableModal>
  );
}
