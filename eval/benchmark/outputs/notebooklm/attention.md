# The Transformer

## Architecture

### Encoder Stack
#### N=6 identical layers
#### Multi-head self-attention sub-layer
#### Position-wise feed-forward sub-layer
#### Residual connections & Layer normalization

### Decoder Stack
#### N=6 identical layers
#### Masked multi-head self-attention
#### Encoder-decoder multi-head attention
#### Auto-regressive property

## Attention Mechanisms

### Scaled Dot-Product Attention
#### Query, Key, and Value vectors
#### Scaling factor (1/sqrt(dk))
#### Softmax weights

### Multi-Head Attention
#### h=8 parallel heads
#### Learned linear projections
#### Joint attention to representation subspaces

### Applications
#### Encoder self-attention
#### Decoder self-attention (with masking)
#### Encoder-decoder attention

## Key Model Components
- Positional Encoding (Sinusoidal frequencies)
- Position-wise Feed-Forward (Linear transformations + ReLU)
- Learned Embeddings (d_model=512)
- Shared weight matrices

## Why Self-Attention
- Computational complexity per layer
- Maximum parallelization
- Short path lengths for long-range dependencies
- Model interpretability

## Training & Regularization
- Adam Optimizer (Warmup schedule)
- Residual Dropout (Rate = 0.1)
- Label Smoothing
- 8 NVIDIA P100 GPUs

## Results

### Machine Translation
#### 28.4 BLEU (English-to-German)
#### 41.8 BLEU (English-to-French)
#### Significant training cost reduction

### Generalization
#### English constituency parsing success
#### Effective with limited and large data
