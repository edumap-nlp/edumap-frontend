# Transformer Model

## Model Architecture

### Encoder Stack
#### N=6 Identical Layers
#### Multi-Head Self-Attention
#### Position-wise Feed-Forward Network
#### Residual Connections
#### Layer Normalization

### Decoder Stack
#### N=6 Identical Layers
#### Masked Multi-Head Self-Attention
#### Encoder-Decoder Attention
#### Position-wise Feed-Forward Network

### Positional Encoding
#### Sine and Cosine Functions
#### Sequence Order Information

## Attention Mechanisms

### Scaled Dot-Product Attention
#### Queries, Keys, and Values
#### Dot-product compatibility
#### Scaling factor (1/sqrt(dk))
#### Softmax weights

### Multi-Head Attention
#### h=8 Parallel Heads
#### Different Representation Subspaces
#### Concatenated Outputs

### Self-Attention Advantages
#### Constant Path Length
#### Parallelizable Computation
#### Long-range Dependencies

## Training Regime

### Optimization
#### Adam Optimizer
#### Warmup and Decay Schedule

### Regularization
#### Residual Dropout
#### Label Smoothing

### Hardware
#### 8 NVIDIA P100 GPUs

## Evaluation Results

### Machine Translation
#### WMT 2014 English-to-German: 28.4 BLEU
#### WMT 2014 English-to-French: 41.8 BLEU

### Generalization
#### English Constituency Parsing
