# Attention Mechanisms in Transformer Models

## Transformer Architecture
### Transformer Model [Important]
A new architecture based solely on attention mechanisms, without recurrence or convolutions.
### Encoder-Decoder Structure
A common architecture in sequence transduction models where an encoder maps input to representations and a decoder generates output.
### Encoder Stack
Composed of 6 identical layers with self-attention and feed-forward networks.
### Decoder Stack
Similar to the encoder but includes an additional encoder-decoder attention sub-layer.
### Auto-Regressive Property
The decoder generates each output based on previously generated outputs.

## Attention Mechanisms
### Self-Attention Mechanism
An attention mechanism relating different positions of a single sequence to compute a representation.
### Multi-Head Attention
A technique using multiple attention layers in parallel to capture different representation subspaces.
### Scaled Dot-Product Attention
An attention function using dot products scaled by the square root of key dimension.
### Masked Self-Attention
Prevents positions in the decoder from attending to future positions to maintain auto-regression.
### Restricted Self-Attention
A proposed method to handle very long sequences by limiting attention to a neighborhood.

## Positional and Structural Components
### Positional Encoding
Injecting information about the sequence order using sine and cosine functions.
### Sinusoidal Positional Encoding
Chosen for its potential to allow models to learn relative positions easily.
### Residual Connection
A technique to facilitate training by adding the input to the output of a layer.
### Layer Normalization
A method to stabilize and accelerate training by normalizing layer inputs.
### Feed-Forward Networks
Applied position-wise in each layer, consisting of two linear transformations with ReLU activation.

## Training and Optimization
### Adam Optimizer
An optimization algorithm used for training the Transformer model.
### Label Smoothing
A regularization technique that encourages the model to be less confident in its predictions.
### Dropout Regularization
A technique to prevent overfitting by randomly dropping units during training.
### Training Data and Batching
Using large datasets with byte-pair encoding and batching by sequence length for efficient training.
### Parallelization in Training
The ability to perform computations simultaneously, crucial for efficient training.

## Evaluation and Performance
### BLEU Score
A metric for evaluating the quality of machine-translated text.
### WMT 2014 English-to-German Task
A machine translation benchmark task where the Transformer achieved a BLEU score of 28.4.
### WMT 2014 English-to-French Task
A machine translation benchmark task where the Transformer achieved a BLEU score of 41.8.
### Training Cost Comparison [Table]
The Transformer achieves better performance at a fraction of the training cost compared to previous models.

## Applications and Extensions
### Sequence Transduction
The process of converting sequences from one form to another, such as in language translation.
### English Constituency Parsing
A task where the Transformer was applied successfully, demonstrating its generalization ability.
### Attention Visualization [Visual]
Analyzing attention distributions to interpret model behavior.
### Model Variations
Experimentation with different hyperparameters to assess their impact on performance.

## Computational Considerations
### Computational Complexity
The amount of computation required per layer in different neural network architectures.
### Path Length in Networks
The number of operations required to connect two positions in a sequence, affecting dependency learning.

## Tools and Frameworks
### Byte-Pair Encoding
A method for encoding text into subword units to handle rare words.
### Tensor2Tensor Codebase
The software framework used to implement and evaluate the Transformer model.