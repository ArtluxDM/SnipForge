<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Duplicate Commands Found</h2>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>

      <div class="modal-body">
        <div class="duplicate-icon">⚠️</div>
        <p class="info-text">
          Found <strong>{{ duplicates.length }}</strong> duplicate command{{ duplicates.length > 1 ? 's' : '' }} with matching content.
        </p>
        <p class="sub-text">
          How would you like to handle them?
        </p>
      </div>

      <div class="modal-footer">
        <button @click="$emit('cancel')" class="cancel-button">
          Cancel Import
        </button>
        <div class="spacer"></div>
        <button @click="handleChoice('skip')" class="choice-button">
          Keep Existing
        </button>
        <button @click="handleChoice('replace')" class="choice-button primary">
          Replace with New
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DuplicateMatch } from '../utils/importExport'

interface Props {
  show: boolean
  duplicates: DuplicateMatch[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  cancel: []
  apply: [actions: ('skip' | 'replace')[]]
}>()

const handleChoice = (choice: 'skip' | 'replace') => {
  // Create array with all duplicates having the same action
  const actions = new Array(props.duplicates.length).fill(choice) as ('skip' | 'replace')[]
  emit('apply', actions)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 12px;
  max-width: 500px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #404040;
}

.modal-header h2 {
  margin: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.close-button:hover {
  background: #404040;
  color: #ffffff;
}

.modal-body {
  padding: 40px 32px;
  text-align: center;
}

.duplicate-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.info-text {
  margin: 0 0 12px 0;
  color: #ffffff;
  font-size: 16px;
  line-height: 1.5;
}

.info-text strong {
  color: #ec5002ee;
}

.sub-text {
  margin: 0;
  color: #999;
  font-size: 14px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #404040;
}

.spacer {
  flex: 1;
}

.cancel-button {
  padding: 10px 20px;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-button:hover {
  background: #3a3a3a;
}

.choice-button {
  padding: 12px 24px;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.choice-button:hover {
  background: #3a3a3a;
  border-color: #555;
}

.choice-button.primary {
  background: #ec5002ee;
  border-color: #ec5002ee;
  font-weight: 600;
}

.choice-button.primary:hover {
  background: #d4470a;
  border-color: #d4470a;
}
</style>
