<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Enter Variable Values</h2>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>
      <div class="modal-body">
        <div class="variable-info">
          <p>Please provide values for the following variables:</p>
        </div>
        <div v-for="variable in variables" :key="variable" class="form-group">
          <label :for="variable">{{ variable }}:</label>
          <input
            :id="variable"
            v-model="values[variable]"
            type="text"
            :placeholder="`Enter value for ${variable}`"
            :ref="el => { if (el) inputRefs[variable] = el as HTMLInputElement }"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button @click="$emit('cancel')" class="cancel-button">Cancel</button>
        <button @click="handleSubmit" class="submit-button">
          Copy Command
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, reactive } from 'vue'

// Props
interface Props {
  show: boolean
  variables: string[]
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  submit: [values: Record<string, string>]
  cancel: []
}>()

// Form data
const values = reactive<Record<string, string>>({})
const inputRefs = reactive<Record<string, HTMLInputElement>>({})

// Initialize values when variables change
watch(() => props.variables, (newVariables) => {
  // Clear previous values
  Object.keys(values).forEach(key => delete values[key])

  // Initialize new variables with empty strings
  newVariables.forEach(variable => {
    values[variable] = ''
  })
}, { immediate: true })

// Focus first input when modal opens
watch(() => props.show, (isShown) => {
  if (isShown && props.variables.length > 0) {
    nextTick(() => {
      const firstVariable = props.variables[0]
      const firstInput = inputRefs[firstVariable]
      if (firstInput) {
        firstInput.focus()
      }
    })
  }
})

// Handle form submission
const handleSubmit = () => {
  // Check if all variables have values
  const emptyVariables = props.variables.filter(variable => !values[variable]?.trim())

  if (emptyVariables.length > 0) {
    alert(`Please provide values for: ${emptyVariables.join(', ')}`)
    return
  }

  // Emit the values
  emit('submit', { ...values })
}
</script>

<style scoped>
/* Component-specific styles */
.variable-info {
  margin-bottom: 20px;
}

.variable-info p {
  margin: 0;
  color: #cccccc;
  font-size: 14px;
}
</style>